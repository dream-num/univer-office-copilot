import { afterEach, describe, expect, it, vi } from 'vitest';
import { createModel } from '../src/modules/providers/index.ts';
import { discoverDeepSeekModels } from '../src/modules/providers/models.ts';
import {
  effectiveReasoningEffort,
  modelProfileSchema,
  type ModelProfile,
} from '@univer-copilot/shared';

afterEach(() => vi.unstubAllGlobals());
const base: ModelProfile = {
  id: 'test',
  provider: 'deepseek',
  name: 'DeepSeek',
  model: 'deepseek-flash',
  thinking: true,
};
const remoteModels = {
  data: [
    {
      id: 'deepseek-flash',
      name: 'DeepSeek-V4.1-Flash',
      context_window: 1048576,
      max_output_tokens: 393216,
      input_modalities: ['text', 'image'],
      effort: { supported_levels: ['low', 'high', 'max'], default_level: 'high' },
    },
    {
      id: 'deepseek-v4-pro',
      name: 'DeepSeek-V4-Pro',
      input_modalities: ['text'],
      effort: { supported_levels: ['low', 'high', 'max'], default_level: 'high' },
    },
  ],
};

describe('provider model discovery and reasoning controls', () => {
  it('normalizes current provider metadata and keeps credentials at the official endpoint', async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(remoteModels)));
    const models = await discoverDeepSeekModels('fixture-secret', request);
    expect(request).toHaveBeenCalledWith(
      'https://api.deepseek.com/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer fixture-secret' },
        redirect: 'error',
      }),
    );
    expect(models[0]).toMatchObject({
      id: 'deepseek-flash',
      name: 'DeepSeek-V4.1-Flash',
      contextWindow: 1048576,
      maxOutputTokens: 393216,
      inputModalities: ['text', 'image'],
      reasoningEfforts: ['low', 'high', 'max'],
      defaultReasoningEffort: 'high',
    });
    expect(models[1]?.inputModalities).toEqual(['text']);
    expect(JSON.stringify(models)).not.toContain('fixture-secret');
  });
  it('handles older minimal model lists without inventing names or capabilities and redacts failures', async () => {
    const models = await discoverDeepSeekModels(
      'fixture-secret',
      async () => new Response(JSON.stringify({ data: [{ id: 'legacy' }] })),
    );
    expect(models[0]).toMatchObject({
      id: 'legacy',
      name: 'legacy',
      inputModalities: ['text'],
      reasoningEfforts: [],
    });
    for (const request of [
      async () => new Response('fixture-secret', { status: 401 }),
      async () => new Response('{}'),
      async () => {
        throw new Error('fixture-secret');
      },
    ])
      await expect(discoverDeepSeekModels('fixture-secret', request)).rejects.toMatchObject({
        code: 'MODEL_DISCOVERY_FAILED',
        message: 'Unable to load DeepSeek models. Check the key and try again.',
      });
  });
  it('preserves legacy thinking settings and rejects unsupported or cross-provider effort fields', () => {
    expect(effectiveReasoningEffort(base)).toBe('high');
    expect(effectiveReasoningEffort({ ...base, thinking: false })).toBe('off');
    expect(effectiveReasoningEffort({ ...base, thinking: false, reasoningEffort: 'max' })).toBe(
      'max',
    );
    expect(modelProfileSchema.safeParse({ ...base, reasoningEffort: 'medium' }).success).toBe(
      false,
    );
    expect(
      modelProfileSchema.safeParse({ ...base, provider: 'custom', reasoningEffort: 'max' }).success,
    ).toBe(false);
  });
  for (const level of ['off', 'low', 'high', 'max'] as const)
    it(`sends the actual ${level} parameters through the LangChain adapter`, async () => {
      const bodies: Record<string, unknown>[] = [];
      vi.stubGlobal('fetch', async (_input: unknown, init?: RequestInit) => {
        bodies.push(JSON.parse(init?.body as string));
        return new Response(
          JSON.stringify({
            id: 'fixture',
            object: 'chat.completion',
            created: 0,
            model: base.model,
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Connected.' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      });
      const model = await createModel({ ...base, reasoningEffort: level }, 'fixture-secret');
      await model.invoke('Reply briefly.');
      expect(bodies).toHaveLength(1);
      expect(bodies[0]?.thinking).toEqual({ type: level === 'off' ? 'disabled' : 'enabled' });
      expect(bodies[0]?.reasoning_effort).toBe(level === 'off' ? undefined : level);
      expect(bodies[0]?.model).toBe('deepseek-flash');
    });
});
