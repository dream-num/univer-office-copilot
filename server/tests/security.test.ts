import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApplication } from '../src/bootstrap/app.ts';
import { publicAddress, validateEndpoint } from '../src/modules/providers/endpoint.ts';
import { publicDeltas } from '../src/modules/copilot/content.ts';

describe('permissions and publication boundaries', () => {
  let application: Awaited<ReturnType<typeof createApplication>>, directory: string, origin: string;
  let owner: { id: string; email: string; cookie: string }, viewer: typeof owner;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'copilot-permissions-'));
    application = await createApplication({
      host: '127.0.0.1',
      port: 0,
      demo: true,
      dataDir: directory,
    });
    origin = `http://127.0.0.1:${await application.start()}`;
    async function user() {
      const response = await fetch(`${origin}/api/auth/demo`, { method: 'POST' });
      const { user } = (await response.json()) as { user: { id: string; email: string } };
      return { ...user, cookie: response.headers.get('set-cookie')!.split(';')[0]! };
    }
    owner = await user();
    viewer = await user();
  });
  afterAll(async () => {
    await application?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  it('publishes only the Office runtime license, never the server license pair', async () => {
    // The service has already read its server configuration at startup.
    vi.stubEnv('UNIVER_LICENSE', 'private-server-license-fixture');
    vi.stubEnv('UNIVER_LICENSE_KEY', 'private-server-key-fixture');
    vi.stubEnv('UNIVER_CLIENT_LICENSE', ' public-runtime-license-fixture ');
    try {
      const config = await (await fetch(`${origin}/api/config`)).json();
      expect(config.clientLicense).toBe('public-runtime-license-fixture');
      expect(JSON.stringify(config)).not.toContain('private-server');
      vi.stubEnv('UNIVER_CLIENT_LICENSE', '');
      expect((await (await fetch(`${origin}/api/config`)).json()).clientLicense).toBe('');
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('checks Viewer access on server operations and closes file links independently', async () => {
    const { files } = application.services;
    const file = await files.create(owner.id, 'sheet', 'Private file');
    expect(() => files.get(file.id, viewer.id)).toThrow();
    await files.setPermission(file.id, owner.id, viewer.email, 'viewer');
    expect(files.get(file.id, viewer.id).role).toBe('viewer');
    for (const access of ['write', 'manage', 'history'] as const)
      expect(() => files.get(file.id, viewer.id, access)).toThrow();
    await expect(files.restore(file.id, viewer.id, 1, 1, randomUUID())).rejects.toThrow();
    const link = files.createLink(file.id, owner.id, 1);
    expect(files.shared(link.token).file.role).toBe('viewer');
    expect(() => files.get(file.id, files.shared(link.token).actorId, 'write')).toThrow();
    await files.revokeLink(file.id, owner.id, link.id);
    expect(() => files.shared(link.token)).toThrow();
    expect(files.get(file.id, viewer.id).role).toBe('viewer');
    await files.setPermission(file.id, owner.id, viewer.email, null);
    expect(() => files.get(file.id, viewer.id)).toThrow();
  });
  it('persists per-file emoji metadata, validates complete sequences, and keeps native revisions unchanged', async () => {
    const { files, office } = application.services;
    const file = await files.create(owner.id, 'sheet', 'Emoji test');
    const request = (emoji: unknown, cookie = owner.cookie) =>
      fetch(`${origin}/api/files/${file.id}`, {
        method: 'PATCH',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
    const before = await office.inspect(file, owner.id);
    for (const emoji of ['📊', '👩🏽‍💻', '🇺🇸', '1️⃣', '👨‍👩‍👧‍👦']) {
      const response = await request(emoji);
      expect(response.status).toBe(200);
      expect((await response.json()).file.emoji).toBe(emoji);
      expect(files.list(owner.id).find((value) => value.id === file.id)?.emoji).toBe(emoji);
    }
    for (const invalid of ['', 'text', '📊📈', '<script>', 'x📊', '🏽', 'a'.repeat(100)]) {
      expect((await request(invalid)).status).toBe(400);
    }
    expect(files.get(file.id, owner.id).emoji).toBe('👨‍👩‍👧‍👦');
    await files.setPermission(file.id, owner.id, viewer.email, 'viewer');
    expect(files.get(file.id, viewer.id).emoji).toBe('👨‍👩‍👧‍👦');
    expect((await request('🎯', viewer.cookie)).status).toBe(403);
    const link = files.createLink(file.id, owner.id, 1);
    expect(files.shared(link.token).file.emoji).toBe('👨‍👩‍👧‍👦');
    expect((await request(null)).status).toBe(200);
    expect(files.get(file.id, owner.id).emoji).toBeNull();
    expect(await office.inspect(file, owner.id)).toEqual(before);
  });
  it('requires management permission for every referenced file when publishing a conversation', async () => {
    const { files, conversations } = application.services;
    const own = await files.create(owner.id, 'doc', 'Own document'),
      other = await files.create(viewer.id, 'doc', 'Reference');
    await files.setPermission(other.id, viewer.id, owner.email, 'viewer');
    const conversation = conversations.create(owner.id, own.id);
    conversations.rememberReferences(conversation.id, owner.id, [other.id], 'ask');
    expect(() => conversations.publish(conversation.id, owner.id, 1)).toThrow();
  });
  it('rejects cross-origin state changes', async () => {
    const response = await fetch(`${origin}/api/files`, {
      method: 'POST',
      headers: {
        Cookie: owner.cookie,
        Origin: 'https://untrusted.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'blocked', type: 'sheet' }),
    });
    expect(response.status).toBe(403);
  });
  it('searches message text within the current file and private owner, and persists chat modes', async () => {
    const { files, conversations, office } = application.services;
    const file = await files.create(owner.id, 'doc', 'Private chat search');
    const otherFile = await files.create(owner.id, 'doc', 'Different chat file');
    await files.setPermission(file.id, owner.id, viewer.email, 'viewer');
    const own = conversations.create(owner.id, file.id, 'Budget review');
    const privateChat = conversations.create(viewer.id, file.id, 'Private collaborator chat');
    const other = conversations.create(owner.id, otherFile.id, 'Other file chat');
    for (const [chat, actor, text] of [
      [own, owner, 'Budget contains UNIQUE-METRIC 93.'],
      [privateChat, viewer, 'Private UNIQUE-METRIC'],
      [other, owner, 'Other UNIQUE-METRIC'],
    ] as const)
      conversations.append(chat.id, actor.id, 'user', text, randomUUID());
    const found = conversations.list(owner.id, file.id, 'unique-metric');
    expect(found.map((c) => c.id)).toEqual([own.id]);
    expect(found[0]?.preview).toContain('UNIQUE-METRIC 93');
    const before = await office.revision(file, owner.id);
    const patch = (body: unknown, cookie = owner.cookie) =>
      fetch(`${origin}/api/conversations/${own.id}`, {
        method: 'PATCH',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    expect((await patch({ mode: 'edit' })).status).toBe(204);
    expect(conversations.get(own.id, owner.id).mode).toBe('edit');
    expect((await patch({ title: 'Final budget' })).status).toBe(204);
    expect(conversations.get(own.id, owner.id)).toMatchObject({
      title: 'Final budget',
      mode: 'edit',
    });
    expect((await patch({ mode: 'edit' }, viewer.cookie)).status).toBe(404);
    for (const invalid of [{}, { mode: 'unknown' }, { fileId: otherFile.id }])
      expect((await patch(invalid)).status).toBe(400);
    expect(await office.revision(file, owner.id)).toBe(before);
  });
  it('paginates conversation history without dropping conversations with equal timestamps', async () => {
    const { files, conversations } = application.services;
    const file = await files.create(owner.id, 'doc', 'Conversation pagination');
    for (let index = 0; index < 120; index++)
      conversations.create(owner.id, file.id, `History ${index}`);
    application.db
      .prepare('UPDATE conversations SET updated_at=? WHERE file_id=?')
      .run(123, file.id);
    const first = conversations.list(owner.id, file.id),
      cursor = first.at(-1)!;
    const second = conversations.list(owner.id, file.id, '', cursor.updatedAt, 50, cursor.id),
      next = second.at(-1)!;
    const third = conversations.list(owner.id, file.id, '', next.updatedAt, 50, next.id);
    expect(new Set([...first, ...second, ...third].map((value) => value.id)).size).toBe(120);
    expect(conversations.list(owner.id, file.id, 'History 119')).toHaveLength(1);
  });
});

describe('model boundary', () => {
  it('blocks local, reserved, metadata, and mapped-IP custom endpoints', async () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '169.254.169.254',
      '100.64.0.1',
      '192.0.2.2',
      '::1',
      '::ffff:127.0.0.1',
      'fc00::1',
      '2001:db8::1',
      '2002:7f00:1::',
    ])
      expect(publicAddress(address)).toBe(false);
    expect(publicAddress('8.8.8.8')).toBe(true);
    expect(publicAddress('2606:4700::1111')).toBe(true);
    await expect(validateEndpoint('http://127.0.0.1:3100')).rejects.toThrow();
    await expect(validateEndpoint('https://127.0.0.1')).rejects.toThrow();
    const credentialsInUrl = new URL('https://example.com');
    credentialsInUrl.username = 'name';
    credentialsInUrl.password = 'password';
    await expect(validateEndpoint(credentialsInUrl.href)).rejects.toThrow();
  });
  it('uses only public reasoning fields and ignores signatures or redacted content', () => {
    expect(
      publicDeltas({
        content: [
          { type: 'thinking', thinking: 'Public thought', signature: 'private-signature' },
          { type: 'redacted_thinking', data: 'private-payload' },
          { type: 'text', text: 'Answer' },
        ],
      }),
    ).toEqual({ text: 'Answer', reasoning: 'Public thought' });
    expect(
      publicDeltas({
        content: '',
        additional_kwargs: { reasoning_content: 'DeepSeek public reasoning' },
      }).reasoning,
    ).toBe('DeepSeek public reasoning');
  });
});
