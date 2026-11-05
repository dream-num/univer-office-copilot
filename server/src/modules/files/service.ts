import { randomBytes, randomUUID } from 'node:crypto';
import type { FileType, OfficeFile, FileRole, DocumentFlavor } from '@univer-copilot/shared';
import type { AppDatabase } from '../../db/index.ts';
import { AppError } from '../../http/errors.ts';
import type { OfficeGateway, OfficeInitialData } from '../../office/contracts.ts';
import type { UnitCoordinator } from '../../coordination/index.ts';
import { hashToken } from '../auth/index.ts';
import type { AuthService } from '../auth/index.ts';
import { createFilesRepository } from './repository.ts';

export type Access = 'read' | 'write' | 'history' | 'manage';
export function createFilesService(
  db: AppDatabase,
  auth: AuthService,
  office: OfficeGateway,
  coordinator: UnitCoordinator,
  invalidate: (unitId: string) => Promise<void>,
) {
  const repo = createFilesRepository(db);
  function get(id: string, actorId: string, access: Access = 'read'): OfficeFile {
    const file = repo.get(id);
    let role = repo.role(actorId, id);
    if (actorId.startsWith('share:')) {
      const link = db
        .prepare('SELECT file_id FROM file_links WHERE id=? AND revoked=0 AND expires_at>?')
        .get(actorId.slice(6), Date.now()) as { file_id: string } | undefined;
      role = link?.file_id === id && file && !file.deletedAt ? 'viewer' : null;
    }
    const allowed =
      role &&
      (access === 'read' ||
        (access === 'write' && role !== 'viewer') ||
        (access === 'history' && role !== 'viewer') ||
        (access === 'manage' && role === 'owner'));
    if (!file || !allowed)
      throw new AppError(
        403,
        'FILE_ACCESS_DENIED',
        'You do not have permission to access this file.',
      );
    return { ...file, role: role! };
  }
  function byUnit(unitId: string, actorId: string, access: Access = 'read') {
    const file = repo.byUnit(unitId);
    if (!file) throw new AppError(404, 'FILE_NOT_FOUND', 'This file is not available.');
    return get(file.id, actorId, access);
  }
  async function create(
    actorId: string,
    type: FileType,
    name: string,
    folderId: string | null = null,
    documentFlavor?: DocumentFlavor,
    initial?: OfficeInitialData,
  ) {
    if (
      folderId &&
      !db.prepare('SELECT id FROM folders WHERE id=? AND owner_id=?').get(folderId, actorId)
    )
      throw new AppError(400, 'INVALID_FOLDER', 'Choose one of your folders.');
    const now = Date.now(),
      file: OfficeFile = {
        id: randomUUID(),
        unitId: randomUUID(),
        type,
        name,
        ownerId: actorId,
        folderId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        role: 'owner',
        ...(type === 'doc' ? { documentFlavor: documentFlavor ?? 'modern' } : {}),
      };
    const operationId = randomUUID();
    db.prepare('INSERT INTO operations VALUES(?,?,?,?,?,?,?)').run(
      operationId,
      actorId,
      file.id,
      'create',
      'prepared',
      JSON.stringify(initial ? { file, initial } : file),
      now,
    );
    try {
      await office.create(file, actorId, initial);
    } catch (error) {
      if (error instanceof AppError && error.status >= 400 && error.status < 500)
        db.prepare("UPDATE operations SET status='failed' WHERE id=?").run(operationId);
      throw error;
    }
    repo.insert(file);
    db.prepare("UPDATE operations SET status='confirmed' WHERE id=?").run(operationId);
    return file;
  }
  async function recoverCreates() {
    const rows = db
      .prepare("SELECT id,result_json FROM operations WHERE kind='create' AND status='prepared'")
      .all() as { id: string; result_json: string }[];
    for (const row of rows) {
      const value = JSON.parse(row.result_json) as
        | OfficeFile
        | { file: OfficeFile; initial: OfficeInitialData };
      const file = 'file' in value ? value.file : value;
      await office.create(file, file.ownerId, 'file' in value ? value.initial : undefined);
      repo.insert(file);
      db.prepare("UPDATE operations SET status='confirmed' WHERE id=?").run(row.id);
    }
  }
  function list(actorId: string, trash = false) {
    return repo.list(actorId, trash);
  }
  function permissionList(id: string, actorId: string) {
    get(id, actorId, 'manage');
    return (
      db.prepare('SELECT user_id,role FROM permissions WHERE file_id=?').all(id) as {
        user_id: string;
        role: string;
      }[]
    ).map((row) => ({ ...auth.findPublicUser(row.user_id)!, role: row.role }));
  }
  async function setPermission(
    id: string,
    actorId: string,
    email: string,
    role: 'viewer' | 'editor' | null,
  ) {
    const file = get(id, actorId, 'manage');
    const user = auth.findPublicUser(email.toLowerCase(), true);
    if (!user)
      throw new AppError(404, 'USER_NOT_FOUND', 'Ask this person to create an account first.');
    if (user.id === file.ownerId)
      throw new AppError(400, 'OWNER_ROLE', 'The owner already has full access.');
    if (role)
      db.prepare(
        'INSERT INTO permissions VALUES(?,?,?) ON CONFLICT(file_id,user_id) DO UPDATE SET role=excluded.role',
      ).run(id, user.id, role);
    else db.prepare('DELETE FROM permissions WHERE file_id=? AND user_id=?').run(id, user.id);
    await invalidate(file.unitId);
  }
  function createLink(id: string, actorId: string, hours: number) {
    get(id, actorId, 'manage');
    const token = randomBytes(32).toString('base64url'),
      linkId = randomUUID(),
      expiresAt = Date.now() + hours * 3600000;
    db.prepare('INSERT INTO file_links VALUES(?,?,?,?,0)').run(
      linkId,
      id,
      hashToken(token),
      expiresAt,
    );
    return { id: linkId, token, expiresAt };
  }
  function shared(token: string) {
    const link = db
      .prepare(
        'SELECT id,file_id FROM file_links WHERE token_hash=? AND expires_at>? AND revoked=0',
      )
      .get(hashToken(token), Date.now()) as { id: string; file_id: string } | undefined;
    if (!link)
      throw new AppError(404, 'SHARE_UNAVAILABLE', 'This link has expired or been closed.');
    return { file: get(link.file_id, `share:${link.id}`), actorId: `share:${link.id}` };
  }
  async function revokeLink(fileId: string, actorId: string, id: string) {
    const file = get(fileId, actorId, 'manage');
    db.prepare('UPDATE file_links SET revoked=1 WHERE id=? AND file_id=?').run(id, fileId);
    await invalidate(file.unitId);
  }
  async function restore(
    fileId: string,
    actorId: string,
    revision: number,
    expectedRevision: number,
    operationId: string,
  ) {
    const file = get(fileId, actorId, 'manage');
    const prior = db
      .prepare('SELECT owner_id,file_id,status,result_json FROM operations WHERE id=?')
      .get(operationId) as
      | { owner_id: string; file_id: string; status: string; result_json: string }
      | undefined;
    if (prior) {
      if (prior.owner_id !== actorId || prior.file_id !== fileId)
        throw new AppError(409, 'OPERATION_CONFLICT', 'This operation ID is already in use.');
      if (prior.status === 'confirmed')
        return JSON.parse(prior.result_json) as { revision: number };
      throw new AppError(
        409,
        'OPERATION_PENDING',
        'The previous restore must be reconciled before retrying.',
      );
    }
    db.prepare('INSERT INTO operations VALUES(?,?,?,?,?,?,?)').run(
      operationId,
      actorId,
      fileId,
      'restore',
      'prepared',
      JSON.stringify({ revision, expectedRevision }),
      Date.now(),
    );
    return coordinator.restore(file.unitId, async () => {
      try {
        get(fileId, actorId, 'manage');
        const result = {
          revision: await office.restore(file, actorId, revision, expectedRevision),
        };
        db.prepare("UPDATE operations SET status='confirmed',result_json=? WHERE id=?").run(
          JSON.stringify(result),
          operationId,
        );
        return result;
      } catch (error) {
        db.prepare("UPDATE operations SET status='failed' WHERE id=?").run(operationId);
        throw error;
      }
    });
  }
  function update(
    id: string,
    actor: string,
    values: { name?: string; folderId?: string | null; emoji?: string | null },
  ) {
    get(id, actor, 'manage');
    if (
      values.folderId &&
      !db.prepare('SELECT id FROM folders WHERE id=? AND owner_id=?').get(values.folderId, actor)
    )
      throw new AppError(400, 'INVALID_FOLDER', 'Choose one of your folders.');
    if (values.name) repo.rename(id, values.name);
    if (values.folderId !== undefined) repo.move(id, values.folderId);
    if (values.emoji !== undefined) repo.setEmoji(id, values.emoji);
    return get(id, actor);
  }
  async function remove(id: string, actor: string) {
    const file = get(id, actor, 'manage');
    await coordinator.restore(file.unitId, async () => {
      repo.trash(id, Date.now());
      await invalidate(file.unitId);
    });
  }
  function recover(id: string, actor: string) {
    if (repo.get(id)?.ownerId !== actor)
      throw new AppError(404, 'FILE_NOT_FOUND', 'This file is not available.');
    repo.trash(id, null);
    return get(id, actor);
  }
  function folders(actor: string) {
    return db
      .prepare('SELECT id,name,parent_id AS parentId FROM folders WHERE owner_id=?')
      .all(actor);
  }
  function createFolder(actor: string, name: string) {
    const id = randomUUID();
    db.prepare('INSERT INTO folders VALUES(?,?,?,NULL)').run(id, actor, name);
    return { id, name, parentId: null };
  }
  function links(id: string, actor: string) {
    get(id, actor, 'manage');
    return db
      .prepare('SELECT id,expires_at AS expiresAt,revoked FROM file_links WHERE file_id=?')
      .all(id);
  }
  return {
    get,
    byUnit,
    create,
    async importFile(actorId: string, bytes: Uint8Array, filename: string, target?: FileType) {
      const imported = await office.import(bytes, filename, target);
      return create(actorId, imported.type, imported.name, null, imported.documentFlavor, imported);
    },
    list,
    recoverCreates,
    permissionList,
    setPermission,
    createLink,
    shared,
    revokeLink,
    restore,
    touch: repo.touch,
    update,
    remove,
    recover,
    folders,
    createFolder,
    links,
  };
}
export type FilesService = ReturnType<typeof createFilesService>;
