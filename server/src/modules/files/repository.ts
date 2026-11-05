import type { OfficeFile, FileRole } from '@univer-copilot/shared';
import type { AppDatabase } from '../../db/index.ts';

export function createFilesRepository(db: AppDatabase) {
  const fields =
    'id,unit_id AS unitId,type,name,owner_id AS ownerId,folder_id AS folderId,created_at AS createdAt,updated_at AS updatedAt,deleted_at AS deletedAt,document_flavor AS documentFlavor,emoji';
  return {
    get(id: string) {
      return db.prepare(`SELECT ${fields} FROM files WHERE id=?`).get(id) as
        | Omit<OfficeFile, 'role'>
        | undefined;
    },
    byUnit(unitId: string) {
      return db.prepare(`SELECT ${fields} FROM files WHERE unit_id=?`).get(unitId) as
        | Omit<OfficeFile, 'role'>
        | undefined;
    },
    role(userId: string, fileId: string): FileRole | null {
      const file = this.get(fileId);
      if (!file || file.deletedAt) return null;
      if (file.ownerId === userId) return 'owner';
      return (
        (
          db
            .prepare('SELECT role FROM permissions WHERE file_id=? AND user_id=?')
            .get(fileId, userId) as { role: FileRole } | undefined
        )?.role ?? null
      );
    },
    list(userId: string, trash: boolean) {
      return db
        .prepare(
          `SELECT ${fields} FROM files WHERE ${trash ? 'deleted_at IS NOT NULL AND owner_id=?' : 'deleted_at IS NULL AND (owner_id=? OR id IN (SELECT file_id FROM permissions WHERE user_id=?))'} ORDER BY updated_at DESC`,
        )
        .all(...(trash ? [userId] : [userId, userId]))
        .map((row) => ({
          ...row,
          role: row.ownerId === userId ? 'owner' : this.role(userId, row.id as string),
        })) as OfficeFile[];
    },
    insert(file: OfficeFile) {
      db.prepare('INSERT OR IGNORE INTO files VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
        file.id,
        file.unitId,
        file.type,
        file.name,
        file.ownerId,
        file.folderId,
        file.createdAt,
        file.updatedAt,
        file.deletedAt,
        file.documentFlavor ?? null,
        file.emoji ?? null,
      );
    },
    rename(id: string, name: string) {
      db.prepare('UPDATE files SET name=?,updated_at=? WHERE id=?').run(name, Date.now(), id);
    },
    setEmoji(id: string, emoji: string | null) {
      db.prepare('UPDATE files SET emoji=?,updated_at=? WHERE id=?').run(emoji, Date.now(), id);
    },
    move(id: string, folderId: string | null) {
      db.prepare('UPDATE files SET folder_id=?,updated_at=? WHERE id=?').run(
        folderId,
        Date.now(),
        id,
      );
    },
    trash(id: string, deletedAt: number | null) {
      db.prepare('UPDATE files SET deleted_at=?,updated_at=? WHERE id=?').run(
        deletedAt,
        Date.now(),
        id,
      );
    },
    touch(unitId: string) {
      db.prepare('UPDATE files SET updated_at=? WHERE unit_id=?').run(Date.now(), unitId);
    },
  };
}
