import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { Router, raw } from 'express';
import { z } from 'zod';
import { MAX_IMPORT_BYTES, type ChatAttachment } from '@univer-copilot/shared';
import type { AppDatabase } from '../../db/index.ts';
import { AppError } from '../../http/errors.ts';
import type { AuthService } from '../auth/index.ts';
import type { ConversationsService } from '../conversations/index.ts';

type Prepared = Omit<ChatAttachment, 'id' | 'source' | 'name' | 'size'> & {
  mediaType: string;
  text: string;
  preview?: Uint8Array;
};
export function createAttachmentsModule(
  db: AppDatabase,
  auth: AuthService,
  conversations: ConversationsService,
  workerUrl: URL,
) {
  let active: Worker | undefined,
    pending = 0,
    closed = false;
  let queue: Promise<unknown> = Promise.resolve();
  function parse(bytes: Uint8Array, filename: string): Promise<Prepared> {
    if (closed || pending >= 3)
      throw new AppError(429, 'UPLOAD_BUSY', 'File processing is busy. Try again shortly.');
    pending++;
    const result = queue.then(
      () =>
        new Promise<Prepared>((resolve, reject) => {
          if (closed) {
            reject(new AppError(503, 'SERVER_CLOSING', 'The server is stopping.'));
            return;
          }
          const worker = (active = new Worker(workerUrl, {
            workerData: { bytes, filename },
            execArgv: workerUrl.pathname.endsWith('.ts') ? ['--import', 'tsx'] : [],
            env: {},
            resourceLimits: { maxOldGenerationSizeMb: 192, stackSizeMb: 4 },
            stdout: true,
            stderr: true,
          }));
          worker.stdout?.resume();
          worker.stderr?.resume();
          let outcome: { value?: Prepared; error?: AppError } | undefined;
          // Parse in one bounded worker so an untrusted document cannot block HTTP or Office edits.
          const timeout = setTimeout(() => {
            outcome = {
              error: new AppError(
                422,
                'UPLOAD_TIMEOUT',
                'This file took too long to process. Try a smaller file.',
              ),
            };
            void worker.terminate();
          }, 20000);
          worker.once('message', (message: { value?: Prepared; error?: string }) => {
            if (outcome) return;
            outcome = message.value
              ? { value: message.value }
              : {
                  error: new AppError(
                    422,
                    'INVALID_ATTACHMENT',
                    message.error ?? 'This file could not be processed.',
                  ),
                };
            clearTimeout(timeout);
            void worker.terminate();
          });
          worker.once('error', () => {
            outcome = {
              error: new AppError(
                422,
                'INVALID_ATTACHMENT',
                'This file could not be processed. Try a smaller file.',
              ),
            };
            void worker.terminate();
          });
          worker.once('exit', () => {
            clearTimeout(timeout);
            if (active === worker) active = undefined;
            if (outcome?.value) resolve(outcome.value);
            else
              reject(
                outcome?.error ??
                  new AppError(422, 'UPLOAD_STOPPED', 'File processing stopped. Try again.'),
              );
          });
        }),
    );
    queue = result
      .catch(() => {})
      .finally(() => {
        pending--;
      });
    return result;
  }
  function record(id: string, actor: string, conversationId?: string) {
    const row = db
      .prepare(
        'SELECT conversation_id,metadata_json,media_type,text FROM attachments WHERE id=? AND owner_id=?',
      )
      .get(id, actor) as
      | { conversation_id: string; metadata_json: string; media_type: string; text: string }
      | undefined;
    if (!row || (conversationId && row.conversation_id !== conversationId))
      throw new AppError(404, 'ATTACHMENT_NOT_FOUND', 'This attachment is not available.');
    conversations.get(row.conversation_id, actor);
    return { ...row, attachment: JSON.parse(row.metadata_json) as ChatAttachment };
  }
  function get(id: string, actor: string, conversationId?: string) {
    return record(id, actor, conversationId).attachment;
  }
  async function upload(
    conversationId: string,
    actor: string,
    bytes: Uint8Array,
    filename: string,
  ) {
    conversations.get(conversationId, actor);
    if (!bytes.length || bytes.length > MAX_IMPORT_BYTES)
      throw new AppError(400, 'ATTACHMENT_SIZE', 'Choose a non-empty file up to 20 MB.');
    if (!/\.(pdf|png|jpe?g|webp|gif|md|markdown|txt)$/i.test(filename))
      throw new AppError(
        400,
        'ATTACHMENT_TYPE',
        'Upload a PDF, image, Markdown or UTF-8 text file.',
      );
    const prepared = await parse(bytes, filename);
    conversations.get(conversationId, actor);
    const { mediaType, text, preview, ...detail } = prepared;
    const attachment: ChatAttachment = {
      id: randomUUID(),
      source: 'upload',
      name: filename,
      size: bytes.length,
      ...detail,
    };
    db.prepare('INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?)').run(
      attachment.id,
      conversationId,
      actor,
      JSON.stringify(attachment),
      mediaType,
      bytes,
      preview ?? null,
      text,
    );
    return attachment;
  }
  function read(id: string, actor: string, conversationId?: string, offset = 0, limit = 16000) {
    const row = record(id, actor, conversationId);
    return {
      attachment: row.attachment,
      text: row.text.slice(offset, offset + limit),
      offset,
      totalCharacters: row.text.length,
      nextOffset: offset + limit < row.text.length ? offset + limit : null,
    };
  }
  function content(id: string, actor: string, preview = false) {
    const row = record(id, actor);
    const bytes = db
      .prepare(`SELECT ${preview ? 'preview' : 'content'} AS bytes FROM attachments WHERE id=?`)
      .get(id) as { bytes: Uint8Array | null };
    if (!bytes.bytes)
      throw new AppError(404, 'PREVIEW_NOT_FOUND', 'This file has no image preview.');
    return {
      attachment: row.attachment,
      mediaType: preview ? 'image/webp' : row.media_type,
      bytes: bytes.bytes,
    };
  }
  const router = Router();
  router.post(
    '/conversations/:id/attachments',
    (req, _res, next) => {
      conversations.get(req.params.id!, auth.requireUser(req).id);
      next();
    },
    raw({ type: 'application/octet-stream', limit: MAX_IMPORT_BYTES }),
    async (req, res) => {
      const filename = z
        .string()
        .trim()
        .min(1)
        .max(255)
        .parse(req.query.filename)
        .replace(/[\\/\u0000-\u001f\u007f]/g, '_');
      if (!Buffer.isBuffer(req.body))
        throw new AppError(400, 'EMPTY_ATTACHMENT', 'Choose a file to upload.');
      res.status(201).json({
        attachment: await upload(req.params.id!, auth.requireUser(req).id, req.body, filename),
      });
    },
  );
  router.get('/attachments/:id', (req, res) =>
    res.json(
      read(
        req.params.id!,
        auth.requireUser(req).id,
        undefined,
        z.coerce
          .number()
          .int()
          .min(0)
          .max(200000)
          .parse(req.query.offset ?? 0),
      ),
    ),
  );
  for (const part of ['content', 'preview'] as const)
    router.get(`/attachments/:id/${part}`, (req, res) => {
      const value = content(req.params.id!, auth.requireUser(req).id, part === 'preview');
      if (part === 'content') res.attachment(value.attachment.name);
      res.type(value.mediaType).send(Buffer.from(value.bytes));
    });
  return {
    router,
    service: { upload, get, read, content },
    async close() {
      closed = true;
      await active?.terminate();
      await queue;
    },
  };
}
export type AttachmentsService = ReturnType<typeof createAttachmentsModule>['service'];
