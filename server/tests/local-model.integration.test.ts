import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeModel } from '@langchain/core/testing';
import { AIMessage } from '@langchain/core/messages';
import type { ModelProfile } from '@univer-copilot/shared';
import { createApplication } from '../src/bootstrap/app.ts';
import { createProvidersModule, type ModelFactory } from '../src/modules/providers/index.ts';
import { officeEnvironment } from '../src/office/environment.ts';

describe('local environment model credentials', () => {
  let app: Awaited<ReturnType<typeof createApplication>>,
    dir: string,
    origin: string,
    cookie: string,
    actor: string,
    profile: ModelProfile;
  const secret = 'fixture-local-deepseek-secret';
  const factory = vi.fn<ModelFactory>(async () =>
    fakeModel().respond(new AIMessage('Connected from the model fixture.')),
  );
  beforeAll(async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', secret);
    vi.stubEnv('DEEPSEEK_MODEL', 'deepseek-flash');
    vi.stubEnv('DEEPSEEK_THINKING', 'true');
    dir = await mkdtemp(join(tmpdir(), 'copilot-local-model-'));
    app = await createApplication({
      host: '127.0.0.1',
      port: 0,
      demo: true,
      dataDir: dir,
      modelFactory: factory,
    });
    origin = `http://127.0.0.1:${await app.start()}`;
    const response = await fetch(`${origin}/api/auth/demo`, { method: 'POST' });
    cookie = response.headers.get('set-cookie')!.split(';')[0]!;
    actor = (await response.json()).user.id;
  });
  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
    if (dir) await rm(dir, { recursive: true, force: true });
  });
  async function post(path: string, body: unknown) {
    return fetch(`${origin}/api${path}`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  it('creates a reusable non-secret profile and resolves the server key without returning it', async () => {
    const response = await fetch(`${origin}/api/provider-profiles`, {
      headers: { Cookie: cookie },
    });
    const body = await response.text();
    expect(body).not.toContain(secret);
    profile = JSON.parse(body).profiles[0];
    expect(profile).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-flash',
      thinking: true,
      serverKeyAvailable: true,
    });
    expect(app.services.providers.list(actor)).toHaveLength(1);
    const tested = await post('/providers/test', { profileId: profile.id });
    expect(tested.status).toBe(200);
    expect(factory).toHaveBeenLastCalledWith(expect.objectContaining({ id: profile.id }), secret);
    await post('/providers/test', { profileId: profile.id, apiKey: 'page-override' });
    expect(factory).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: profile.id }),
      'page-override',
    );
    const config = await (await fetch(`${origin}/api/config`)).text();
    expect(config).not.toContain(secret);
    expect(config).not.toContain('DEEPSEEK_API_KEY');
  });
  it('runs Copilot without a browser key and keeps the server credential out of durable data', async () => {
    const file = await app.services.files.create(actor, 'sheet', 'Local model test');
    const conversation = app.services.conversations.create(actor, file.id);
    const response = await post('/agent/runs', {
      conversationId: conversation.id,
      fileId: file.id,
      mode: 'ask',
      text: 'Reply briefly.',
      profileId: profile.id,
    });
    expect(response.status).toBe(200);
    const events = await response.text();
    expect(events).toContain('run.completed');
    expect(events).not.toContain(secret);
    for (const table of ['profiles', 'runs', 'run_events', 'messages', 'operations'])
      expect(JSON.stringify(app.db.prepare(`SELECT * FROM ${table}`).all())).not.toContain(secret);
    for (const name of ['application.sqlite', 'application.sqlite-wal'])
      expect((await readFile(join(dir, name))).includes(Buffer.from(secret))).toBe(false);
  });
  it('authenticates discovery, keeps the local key server-side, and saves canonical reasoning preferences', async () => {
    const originalFetch = globalThis.fetch;
    const upstream = vi.fn(async (_input: unknown, init?: RequestInit) => {
      expect(init?.headers).toEqual({ Authorization: `Bearer ${secret}` });
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'deepseek-flash',
              name: 'DeepSeek-V4.1-Flash',
              input_modalities: ['text', 'image'],
              effort: { supported_levels: ['low', 'high', 'max'], default_level: 'high' },
            },
          ],
        }),
      );
    });
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) =>
      String(input) === 'https://api.deepseek.com/models'
        ? upstream(input, init)
        : originalFetch(input, init),
    );
    try {
      const response = await post('/providers/deepseek/models', {});
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain('DeepSeek-V4.1-Flash');
      expect(body).not.toContain(secret);
      const anonymous = await fetch(`${origin}/api/providers/deepseek/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(anonymous.status).toBe(401);
      expect(upstream).toHaveBeenCalledTimes(1);
      const saved = await post('/provider-profiles', {
        ...profile,
        thinking: false,
        reasoningEffort: 'max',
      });
      expect((await saved.json()).profile).toMatchObject({
        reasoningEffort: 'max',
        thinking: true,
      });
      expect(app.services.providers.get(actor, profile.id).reasoningEffort).toBe('max');
      expect(
        JSON.stringify(app.db.prepare('SELECT config_json FROM profiles').all()),
      ).not.toContain(secret);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('never offers the local key to custom endpoints, anonymous callers or non-demo deployments', async () => {
    const custom = await post('/provider-profiles', {
      name: 'Custom',
      provider: 'custom',
      model: 'model',
      baseUrl: 'https://example.com/v1',
      serverKeyAvailable: true,
    });
    const customProfile = (await custom.json()).profile;
    expect(customProfile.serverKeyAvailable).toBe(false);
    const count = factory.mock.calls.length;
    const tested = await post('/providers/test', { profileId: customProfile.id });
    expect(tested.status).toBe(400);
    expect((await tested.json()).error.code).toBe('MODEL_KEY_REQUIRED');
    expect(factory).toHaveBeenCalledTimes(count);
    expect((await fetch(`${origin}/api/provider-profiles`)).status).toBe(401);
    const production = createProvidersModule(app.db, app.services.auth, factory);
    expect(production.service.get(actor, profile.id).serverKeyAvailable).toBe(false);
    await expect(production.service.createModel(profile)).rejects.toMatchObject({
      code: 'MODEL_KEY_REQUIRED',
    });
    expect(officeEnvironment().DEEPSEEK_API_KEY).toBeUndefined();
    expect(process.env.DEEPSEEK_API_KEY).toBe(secret);
  });
});
