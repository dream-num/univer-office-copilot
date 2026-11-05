import { describe, expect, it } from 'vitest';
import { ndjson } from '../src/api/client.ts';
import { createChatStore } from '../src/features/copilot/state/store.ts';
import type { Run, RunEvent } from '@univer-copilot/shared';

describe('conversation stream recovery', () => {
  it('decodes Unicode split across transport chunks and rejects malformed frames', async () => {
    const bytes = new TextEncoder().encode('{"text":"你好"}\n{"seq":2}\n');
    const response = new Response(
      new ReadableStream({
        start(controller) {
          for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
          controller.close();
        },
      }),
    );
    const result = [];
    for await (const frame of ndjson(response)) result.push(frame);
    expect(result).toEqual([{ text: '你好' }, { seq: 2 }]);
    await expect(async () => {
      for await (const _ of ndjson(new Response('not JSON\n'))) {
        /* read */
      }
    }).rejects.toThrow();
  });
  it('replays an active run without duplicating stream events or affecting another conversation', () => {
    const store = createChatStore();
    const run: Run = {
      id: 'run-1',
      conversationId: 'conversation-1',
      fileId: 'file-1',
      status: 'running',
      createdAt: 1,
      error: null,
    };
    store.hydrate(run.conversationId, [], run);
    const event: RunEvent = {
      runId: run.id,
      seq: 1,
      at: 1,
      type: 'text.delta',
      data: { text: 'Recovered text' },
    };
    store.event(run.conversationId, event);
    store.event(run.conversationId, event);
    expect(store.get(run.conversationId).messages[0]?.text).toBe('Recovered text');
    expect(store.get('conversation-2').messages).toHaveLength(0);
    store.hydrate(run.conversationId, [], run);
    expect(store.get(run.conversationId).messages[0]?.text).toBe('Recovered text');
    expect(store.get(run.conversationId).lastSeq).toBe(1);
    expect(store.activeConversation()).toBe(run.conversationId);

    store.event(run.conversationId, { ...event, runId: 'old-run', seq: 2 });
    expect(store.get(run.conversationId).lastSeq).toBe(1);
    store.event(run.conversationId, {
      ...event,
      seq: 2,
      type: 'run.cancelled',
      data: { text: 'Stopped' },
    });
    expect(store.get(run.conversationId).running).toBe(false);
  });
});
