import { Router, raw } from 'express';
import { z } from 'zod';
import {
  fileTypeSchema,
  documentFlavorSchema,
  MAX_IMPORT_BYTES,
  fileEmojiSchema,
} from '@univer-copilot/shared';
import type { AppDatabase } from '../../db/index.ts';
import { AppError } from '../../http/errors.ts';
import type { OfficeGateway } from '../../office/contracts.ts';
import type { UnitCoordinator } from '../../coordination/index.ts';
import type { AuthService } from '../auth/index.ts';
import { createFilesService } from './service.ts';
export type { FilesService, Access } from './service.ts';

export function createFilesModule(
  db: AppDatabase,
  auth: AuthService,
  office: OfficeGateway,
  coordinator: UnitCoordinator,
  invalidate: (unitId: string) => Promise<void>,
) {
  const service = createFilesService(db, auth, office, coordinator, invalidate),
    router = Router();
  router.get('/files', (req, res) => {
    const user = auth.requireUser(req);
    res.json({ files: service.list(user.id, req.query.trash === 'true') });
  });
  router.post('/files', async (req, res) => {
    const user = auth.requireUser(req),
      input = z
        .object({
          name: z.string().trim().min(1).max(100),
          type: fileTypeSchema,
          folderId: z.string().nullable().optional(),
          documentFlavor: documentFlavorSchema.optional(),
        })
        .parse(req.body);
    res.status(201).json({
      file: await service.create(
        user.id,
        input.type,
        input.name,
        input.folderId,
        input.documentFlavor,
      ),
    });
  });
  router.post(
    '/files/import',
    (req, _res, next) => {
      auth.requireUser(req);
      next();
    },
    raw({ type: 'application/octet-stream', limit: MAX_IMPORT_BYTES }),
    async (req, res) => {
      const filename = z.string().trim().min(1).max(255).parse(req.query.filename);
      const target = fileTypeSchema.optional().parse(req.query.target);
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        throw new AppError(400, 'EMPTY_FILE', 'Choose a file to import.');
      res.status(201).json({
        file: await service.importFile(auth.requireUser(req).id, req.body, filename, target),
      });
    },
  );
  router.get('/files/:id/export', async (req, res) => {
    const actor = auth.requireUser(req).id;
    const file = service.get(req.params.id!, actor);
    const format = z.enum(['office', 'native']).default('office').parse(req.query.format);
    const result = await office.export(file, actor, format);
    const filename = `${file.name.replace(/[\\/\u0000-\u001f\u007f]/g, '_')}.${result.extension}`;
    res.attachment(filename).type(result.contentType).send(Buffer.from(result.bytes));
  });
  router.get('/files/:id', (req, res) =>
    res.json({ file: service.get(req.params.id!, auth.requireUser(req).id) }),
  );
  router.patch('/files/:id', async (req, res) => {
    const user = auth.requireUser(req);
    const input = z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        folderId: z.string().nullable().optional(),
        emoji: fileEmojiSchema.optional(),
      })
      .parse(req.body);
    res.json({ file: service.update(req.params.id!, user.id, input) });
  });
  router.delete('/files/:id', async (req, res) => {
    await service.remove(req.params.id!, auth.requireUser(req).id);
    res.status(204).end();
  });
  router.post('/files/:id/recover', (req, res) => {
    res.json({ file: service.recover(req.params.id!, auth.requireUser(req).id) });
  });
  router.get('/folders', (req, res) =>
    res.json({ folders: service.folders(auth.requireUser(req).id) }),
  );
  router.post('/folders', (req, res) => {
    const input = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
    res.status(201).json({ folder: service.createFolder(auth.requireUser(req).id, input.name) });
  });
  router.get('/files/:id/permissions', (req, res) =>
    res.json({ permissions: service.permissionList(req.params.id!, auth.requireUser(req).id) }),
  );
  router.post('/files/:id/permissions', async (req, res) => {
    const input = z
      .object({ email: z.email(), role: z.enum(['viewer', 'editor']).nullable() })
      .parse(req.body);
    await service.setPermission(req.params.id!, auth.requireUser(req).id, input.email, input.role);
    res.status(204).end();
  });
  router.get('/files/:id/share-links', (req, res) =>
    res.json({ links: service.links(req.params.id!, auth.requireUser(req).id) }),
  );
  router.post('/files/:id/share-links', (req, res) => {
    const { hours } = z.object({ hours: z.number().min(1).max(720).default(168) }).parse(req.body);
    res.status(201).json(service.createLink(req.params.id!, auth.requireUser(req).id, hours));
  });
  router.delete('/files/:id/share-links/:linkId', async (req, res) => {
    await service.revokeLink(req.params.id!, auth.requireUser(req).id, req.params.linkId!);
    res.status(204).end();
  });
  router.get('/shared/files/:token', (req, res) => {
    const result = service.shared(req.params.token!);
    res.cookie('copilot_share', req.params.token!, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure,
      path: '/',
    });
    res.json(result);
  });
  router.get('/files/:id/versions', async (req, res) => {
    const actor = auth.requireUser(req).id,
      file = service.get(req.params.id!, actor, 'history');
    res.json({
      versions: (await office.versions(file, actor)).map((version) => ({
        ...version,
        actor: auth.findPublicUser(version.actorId)?.name ?? version.actor,
      })),
    });
  });
  router.get('/files/:id/versions/:revision', async (req, res) => {
    const actor = auth.requireUser(req).id,
      file = service.get(req.params.id!, actor, 'history'),
      revision = z.coerce.number().int().min(1).parse(req.params.revision);
    res.json({ content: await office.preview(file, actor, revision) });
  });
  router.post('/files/:id/restore', async (req, res) => {
    const input = z
      .object({
        revision: z.number().int().min(1),
        expectedRevision: z.number().int().min(1),
        operationId: z.uuid(),
      })
      .parse(req.body);
    res.json(
      await service.restore(
        req.params.id!,
        auth.requireUser(req).id,
        input.revision,
        input.expectedRevision,
        input.operationId,
      ),
    );
  });
  return { service, router };
}
