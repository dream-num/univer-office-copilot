import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  effectiveReasoningEffort,
  modelProfileSchema,
  reasoningEffortSchema,
  type ModelProfile,
} from '@univer-copilot/shared';
import type { AppDatabase } from '../../db/index.ts';
import { AppError } from '../../http/errors.ts';
import type { AuthService } from '../auth/index.ts';
import { endpointFetch, validateEndpoint } from './endpoint.ts';
import { discoverDeepSeekModels } from './models.ts';

export async function createModel(profile: ModelProfile, apiKey: string): Promise<BaseChatModel> {
  const common = { model: profile.model, apiKey, maxRetries: 0, timeout: 90000 };
  if (profile.provider === 'anthropic') {
    const { ChatAnthropic } = await import('@langchain/anthropic');
    return new ChatAnthropic({
      ...common,
      maxTokens: 8192,
      ...(profile.thinking ? { thinking: { type: 'enabled', budget_tokens: 2048 } } : {}),
    });
  }
  if (profile.provider === 'google') {
    const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
    return new ChatGoogleGenerativeAI({
      ...common,
      maxOutputTokens: 8192,
      ...(profile.thinking
        ? { thinkingConfig: { includeThoughts: true, thinkingBudget: 2048 } }
        : {}),
    });
  }
  if (profile.provider === 'deepseek') {
    const effort = effectiveReasoningEffort(profile);
    const { ChatDeepSeek } = await import('@langchain/deepseek');
    return new ChatDeepSeek({
      ...common,
      maxTokens: 16384,
      modelKwargs: {
        thinking: { type: effort === 'off' ? 'disabled' : 'enabled' },
        ...(effort === 'off' ? {} : { reasoning_effort: effort }),
      },
    });
  }
  const { ChatOpenAI } = await import('@langchain/openai');
  const baseURL =
    profile.provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1'
      : profile.provider === 'custom'
        ? await validateEndpoint(profile.baseUrl ?? '')
        : undefined;
  return new ChatOpenAI({
    ...common,
    maxTokens: 8192,
    ...(profile.thinking && profile.provider === 'openai'
      ? { useResponsesApi: true, reasoning: { effort: 'medium', summary: 'auto' } }
      : {}),
    configuration: {
      baseURL,
      fetch:
        profile.provider === 'custom'
          ? endpointFetch(baseURL!)
          : (input, init) => fetch(input, { ...init, redirect: 'error' }),
    },
  });
}

export type ModelFactory = typeof createModel;
export function createProvidersModule(
  db: AppDatabase,
  auth: AuthService,
  modelFactory: ModelFactory = createModel,
  allowLocalModels = false,
) {
  const localKey = allowLocalModels ? process.env.DEEPSEEK_API_KEY?.trim() : undefined;
  const localProfile = localKey
    ? modelProfileSchema.parse({
        name: 'DeepSeek',
        provider: 'deepseek',
        model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-flash',
        thinking: process.env.DEEPSEEK_THINKING !== 'false',
        ...(process.env.DEEPSEEK_REASONING_EFFORT
          ? { reasoningEffort: reasoningEffortSchema.parse(process.env.DEEPSEEK_REASONING_EFFORT) }
          : {}),
        imageInput: false,
      })
    : undefined;
  function availability(profile: ModelProfile): ModelProfile {
    return { ...profile, serverKeyAvailable: !!localKey && profile.provider === 'deepseek' };
  }
  function credential(profile: Pick<ModelProfile, 'provider'>, apiKey?: string) {
    const key = apiKey || (profile.provider === 'deepseek' ? localKey : undefined);
    if (!key) throw new AppError(400, 'MODEL_KEY_REQUIRED', 'Configure an API key before sending.');
    return key;
  }
  async function configuredModel(profile: ModelProfile, apiKey?: string) {
    return modelFactory(profile, credential(profile, apiKey));
  }
  function list(actor: string): ModelProfile[] {
    const profiles = (
      db.prepare('SELECT id,config_json FROM profiles WHERE owner_id=?').all(actor) as {
        id: string;
        config_json: string;
      }[]
    ).map((r) => ({ ...(JSON.parse(r.config_json) as ModelProfile), id: r.id }));
    if (localProfile && !profiles.some((profile) => profile.provider === 'deepseek'))
      profiles.push(save(actor, localProfile));
    return profiles.map(availability);
  }
  function get(actor: string, id: string) {
    const profile = list(actor).find((p) => p.id === id);
    if (!profile) throw new AppError(404, 'MODEL_NOT_CONFIGURED', 'Choose a model configuration.');
    return profile;
  }
  function save(actor: string, input: unknown) {
    const parsed = modelProfileSchema.parse(input),
      id = parsed.id ?? randomUUID();
    const old = db.prepare('SELECT owner_id FROM profiles WHERE id=?').get(id) as
      | { owner_id: string }
      | undefined;
    if (old && old.owner_id !== actor)
      throw new AppError(403, 'PROFILE_ACCESS_DENIED', 'This model configuration is not yours.');
    const config = {
      ...parsed,
      id,
      ...(parsed.reasoningEffort ? { thinking: parsed.reasoningEffort !== 'off' } : {}),
    };
    db.prepare(
      'INSERT INTO profiles VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET config_json=excluded.config_json',
    ).run(id, actor, JSON.stringify(config));
    return availability(config);
  }
  const router = Router();
  router.post('/providers/deepseek/models', async (req, res) => {
    auth.requireUser(req);
    const input = z.object({ apiKey: z.string().min(1).max(4096).optional() }).parse(req.body);
    res.json({
      models: await discoverDeepSeekModels(credential({ provider: 'deepseek' }, input.apiKey)),
    });
  });
  router.get('/provider-profiles', (req, res) =>
    res.json({ profiles: list(auth.requireUser(req).id) }),
  );
  router.post('/provider-profiles', (req, res) =>
    res.status(201).json({ profile: save(auth.requireUser(req).id, req.body) }),
  );
  router.post('/providers/test', async (req, res) => {
    const actor = auth.requireUser(req).id,
      input = z
        .object({ profileId: z.string(), apiKey: z.string().min(1).max(4096).optional() })
        .parse(req.body);
    const model = await configuredModel(get(actor, input.profileId), input.apiKey);
    try {
      const response = await model.invoke('Reply with the word connected.', {
        signal: AbortSignal.timeout(20000),
      });
      res.json({
        authentication: true,
        text: !!response.content,
        tools: 'not-tested',
        reasoning: 'not-tested',
      });
    } catch {
      throw new AppError(
        422,
        'MODEL_CONNECTION_FAILED',
        'The model connection failed. Check the key, model ID and endpoint.',
      );
    }
  });
  return { router, service: { list, get, save, createModel: configuredModel } };
}
export type ProvidersService = ReturnType<typeof createProvidersModule>['service'];
