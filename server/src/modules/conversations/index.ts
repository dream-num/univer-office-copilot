import { randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  type ChatAttachment,
  type Conversation,
  type Message,
  type Mode,
  type Run,
} from '@univer-copilot/shared';
import type { AppDatabase } from '../../db/index.ts';
import { AppError } from '../../http/errors.ts';
import type { AuthService } from '../auth/index.ts';
import { hashToken } from '../auth/index.ts';
import type { FilesService } from '../files/index.ts';

export type ConversationRunSummary = {
  run: Run;
  modifications: { revision: number; summary: string }[];
};
export type ConversationRunsReader = (
  conversationId: string,
  actor: string,
) => ConversationRunSummary[];
export function createConversationsModule(
  db: AppDatabase,
  auth: AuthService,
  files: FilesService,
  readRuns: ConversationRunsReader,
) {
  function owned(id: string, actor: string): Conversation {
    const row = db
      .prepare(
        'SELECT id,file_id AS fileId,title,mode,updated_at AS updatedAt FROM conversations WHERE id=? AND owner_id=?',
      )
      .get(id, actor) as Conversation | undefined;
    if (!row)
      throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'This conversation is not available.');
    return row;
  }
  function get(id: string, actor: string): Conversation {
    const row = owned(id, actor);
    files.get(row.fileId, actor);
    return row;
  }
  function list(
    actor: string,
    fileId: string,
    query = '',
    before = Number.MAX_SAFE_INTEGER,
    limit = 50,
    beforeId = '\uffff',
  ) {
    files.get(fileId, actor);
    return db
      .prepare(
        `SELECT c.id,c.file_id AS fileId,c.title,c.mode,c.updated_at AS updatedAt,
          (SELECT substr(m.text,max(1,instr(lower(m.text),lower(?))-45),160)
            FROM messages m WHERE m.conversation_id=c.id AND instr(lower(m.text),lower(?))>0
            ORDER BY m.created_at DESC,m.rowid DESC LIMIT 1) AS preview
        FROM conversations c WHERE c.owner_id=? AND c.file_id=?
          AND (instr(lower(c.title),lower(?))>0 OR EXISTS (
            SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND instr(lower(m.text),lower(?))>0))
          AND (c.updated_at<? OR (c.updated_at=? AND c.id<?))
        ORDER BY c.updated_at DESC,c.id DESC LIMIT ?`,
      )
      .all(
        query,
        query,
        actor,
        fileId,
        query,
        query,
        before,
        before,
        beforeId,
        limit,
      ) as Conversation[];
  }
  function create(actor: string, fileId: string, title = 'New conversation') {
    files.get(fileId, actor);
    const id = randomUUID();
    db.prepare(
      'INSERT INTO conversations(id,owner_id,file_id,title,mode,updated_at) VALUES(?,?,?,?,?,?)',
    ).run(id, actor, fileId, title, 'ask', Date.now());
    return get(id, actor);
  }
  function messages(id: string, actor: string) {
    get(id, actor);
    return db
      .prepare(
        'SELECT id,conversation_id AS conversationId,role,text,reasoning,run_id AS runId,created_at AS createdAt,attachments_json FROM messages WHERE conversation_id=? ORDER BY created_at,rowid',
      )
      .all(id)
      .map((row) => {
        const { attachments_json, ...message } = row;
        return { ...message, attachments: JSON.parse(attachments_json as string) };
      }) as Message[];
  }
  function append(
    id: string,
    actor: string,
    role: Message['role'],
    text: string,
    runId: string,
    reasoning = '',
    attachments: ChatAttachment[] = [],
  ) {
    owned(id, actor);
    const messageId = randomUUID(),
      at = Date.now();
    db.prepare(
      'INSERT INTO messages(id,conversation_id,role,text,reasoning,run_id,created_at,attachments_json) VALUES(?,?,?,?,?,?,?,?)',
    ).run(messageId, id, role, text, reasoning, runId, at, JSON.stringify(attachments));
    db.prepare('UPDATE conversations SET updated_at=? WHERE id=?').run(at, id);
    if (role === 'user')
      db.prepare("UPDATE conversations SET title=? WHERE id=? AND title='New conversation'").run(
        text.split('\n')[0]!.slice(0, 80),
        id,
      );
    return messageId;
  }
  function rememberReferences(id: string, actor: string, refs: string[], mode: Mode) {
    get(id, actor);
    const row = db.prepare('SELECT referenced_ids FROM conversations WHERE id=?').get(id) as {
      referenced_ids: string;
    };
    const all = [...new Set([...(JSON.parse(row.referenced_ids) as string[]), ...refs])];
    db.prepare('UPDATE conversations SET referenced_ids=?,mode=? WHERE id=?').run(
      JSON.stringify(all),
      mode,
      id,
    );
  }
  function update(id: string, actor: string, input: { title?: string; mode?: Mode }) {
    get(id, actor);
    db.prepare(
      'UPDATE conversations SET title=COALESCE(?,title),mode=COALESCE(?,mode) WHERE id=?',
    ).run(input.title ?? null, input.mode ?? null, id);
  }
  function remove(id: string, actor: string) {
    get(id, actor);
    if (readRuns(id, actor).some(({ run }) => ['running', 'queued'].includes(run.status)))
      throw new AppError(
        409,
        'RUN_ACTIVE',
        'Stop the current run before deleting this conversation.',
      );
    db.prepare('DELETE FROM conversations WHERE id=?').run(id);
  }
  function publish(id: string, actor: string, hours: number) {
    const conversation = get(id, actor),
      row = db.prepare('SELECT referenced_ids FROM conversations WHERE id=?').get(id) as {
        referenced_ids: string;
      };
    const refs = [
      ...new Set([conversation.fileId, ...(JSON.parse(row.referenced_ids) as string[])]),
    ];
    for (const ref of refs) files.get(ref, actor, 'manage');
    const runs = readRuns(id, actor).filter(
      ({ run }) => !['running', 'queued'].includes(run.status),
    );
    const published = {
      title: conversation.title,
      messages: messages(id, actor)
        .filter((m) => !m.runId || runs.some(({ run }) => run.id === m.runId))
        .map((m) => ({
          role: m.role,
          text: m.text,
          createdAt: m.createdAt,
          ...(m.role === 'assistant'
            ? { modifications: runs.find(({ run }) => run.id === m.runId)?.modifications ?? [] }
            : {}),
        })),
    };
    const token = randomBytes(32).toString('base64url'),
      linkId = randomUUID(),
      expiresAt = Date.now() + hours * 3600000;
    db.prepare('INSERT INTO conversation_links VALUES(?,?,?,?,?,?,0)').run(
      linkId,
      id,
      hashToken(token),
      JSON.stringify(published),
      JSON.stringify(refs),
      expiresAt,
    );
    return { id: linkId, token, expiresAt };
  }
  function published(token: string) {
    const row = db
      .prepare(
        'SELECT l.published_json,l.referenced_ids,c.owner_id FROM conversation_links l JOIN conversations c ON c.id=l.conversation_id WHERE l.token_hash=? AND l.revoked=0 AND l.expires_at>?',
      )
      .get(hashToken(token), Date.now()) as
      | { published_json: string; referenced_ids: string; owner_id: string }
      | undefined;
    if (!row)
      throw new AppError(404, 'SHARE_UNAVAILABLE', 'This conversation link is not available.');
    for (const ref of JSON.parse(row.referenced_ids) as string[])
      files.get(ref, row.owner_id, 'manage');
    return JSON.parse(row.published_json) as {
      title: string;
      messages: Pick<Message, 'role' | 'text' | 'createdAt'>[];
    };
  }
  function links(id: string, actor: string) {
    get(id, actor);
    return db
      .prepare(
        'SELECT id,expires_at AS expiresAt,revoked FROM conversation_links WHERE conversation_id=?',
      )
      .all(id);
  }
  function revoke(id: string, actor: string, linkId: string) {
    get(id, actor);
    db.prepare('UPDATE conversation_links SET revoked=1 WHERE id=? AND conversation_id=?').run(
      linkId,
      id,
    );
  }
  const router = Router();
  router.get('/conversations', (req, res) =>
    res.json({
      conversations: list(
        auth.requireUser(req).id,
        z.string().parse(req.query.fileId),
        z
          .string()
          .max(100)
          .parse(req.query.q ?? ''),
        z.coerce
          .number()
          .int()
          .min(0)
          .parse(req.query.before ?? Number.MAX_SAFE_INTEGER),
        z.coerce
          .number()
          .int()
          .min(1)
          .max(100)
          .parse(req.query.limit ?? 50),
        z
          .string()
          .max(100)
          .parse(req.query.beforeId ?? '\uffff'),
      ),
    }),
  );
  router.post('/conversations', (req, res) => {
    const input = z
      .object({ fileId: z.string(), title: z.string().trim().min(1).max(100).optional() })
      .parse(req.body);
    res
      .status(201)
      .json({ conversation: create(auth.requireUser(req).id, input.fileId, input.title) });
  });
  router.get('/conversations/:id', (req, res) => {
    const actor = auth.requireUser(req).id;
    res.json({
      conversation: get(req.params.id!, actor),
      messages: messages(req.params.id!, actor),
    });
  });
  router.patch('/conversations/:id', (req, res) => {
    const input = z
      .object({
        title: z.string().trim().min(1).max(100).optional(),
        mode: z.enum(['ask', 'edit']).optional(),
      })
      .strict()
      .refine((v) => v.title !== undefined || v.mode !== undefined, 'Provide a title or mode.')
      .parse(req.body);
    update(req.params.id!, auth.requireUser(req).id, input);
    res.status(204).end();
  });
  router.delete('/conversations/:id', (req, res) => {
    remove(req.params.id!, auth.requireUser(req).id);
    res.status(204).end();
  });
  router.get('/conversations/:id/share-links', (req, res) =>
    res.json({ links: links(req.params.id!, auth.requireUser(req).id) }),
  );
  router.post('/conversations/:id/share-links', (req, res) => {
    const input = z.object({ hours: z.number().min(1).max(720).default(168) }).parse(req.body);
    res.status(201).json(publish(req.params.id!, auth.requireUser(req).id, input.hours));
  });
  router.delete('/conversations/:id/share-links/:linkId', (req, res) => {
    revoke(req.params.id!, auth.requireUser(req).id, req.params.linkId!);
    res.status(204).end();
  });
  router.get('/shared/conversations/:token', (req, res) => res.json(published(req.params.token!)));
  return {
    router,
    service: {
      get,
      list,
      create,
      messages,
      append,
      rememberReferences,
      publish,
      published,
      remove,
    },
  };
}
export type ConversationsService = ReturnType<typeof createConversationsModule>['service'];
