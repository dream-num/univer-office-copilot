import { z } from 'zod';
import type { ModelOption } from '@univer-copilot/shared';
import { AppError } from '../../http/errors.ts';

const level = z.enum(['low', 'high', 'max']);
const modelList = z.object({
  data: z
    .array(
      z.object({
        id: z.string().min(1).max(150),
        name: z.string().max(200).optional(),
        context_window: z.number().int().positive().optional(),
        max_output_tokens: z.number().int().positive().optional(),
        input_modalities: z.array(z.enum(['text', 'image'])).optional(),
        effort: z
          .object({ supported_levels: z.array(level), default_level: level.optional() })
          .optional(),
      }),
    )
    .max(200),
});

export async function discoverDeepSeekModels(
  apiKey: string,
  request: typeof fetch = fetch,
): Promise<ModelOption[]> {
  try {
    const response = await request('https://api.deepseek.com/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Model discovery failed.');
    const result = modelList.parse(await response.json());
    return result.data.map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      contextWindow: model.context_window,
      maxOutputTokens: model.max_output_tokens,
      inputModalities: model.input_modalities ?? ['text'],
      reasoningEfforts: model.effort?.supported_levels ?? [],
      defaultReasoningEffort: model.effort?.default_level,
    }));
  } catch {
    throw new AppError(
      422,
      'MODEL_DISCOVERY_FAILED',
      'Unable to load DeepSeek models. Check the key and try again.',
    );
  }
}
