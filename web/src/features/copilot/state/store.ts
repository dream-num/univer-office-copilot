import type { ChatAttachment, Message, Run, RunEvent } from '@univer-copilot/shared';
export type ChatSnapshot = {
  messages: Message[];
  events: RunEvent[];
  run: Run | null;
  running: boolean;
  lastSeq: number;
};
const empty: ChatSnapshot = { messages: [], events: [], run: null, running: false, lastSeq: 0 };
export function createChatStore() {
  const states = new Map<string, ChatSnapshot>(),
    listeners = new Set<() => void>();
  const get = (id: string) => states.get(id) ?? empty;
  function set(id: string, state: ChatSnapshot) {
    states.set(id, state);
    for (const fn of listeners) fn();
  }
  return {
    get,
    set,
    hydrate(id: string, messages: Message[], run: Run | null) {
      const running = !!run && ['queued', 'running'].includes(run.status);
      // Returning to a live chat must retain deltas already received by its stream.
      if (running && get(id).running && get(id).run?.id === run.id) return;
      set(id, {
        ...empty,
        run,
        running,
        messages: running
          ? [
              ...messages,
              {
                id: `${run.id}:assistant`,
                conversationId: id,
                role: 'assistant',
                text: '',
                reasoning: '',
                runId: run.id,
                createdAt: run.createdAt + 1,
              },
            ]
          : messages,
      });
    },
    activeConversation() {
      return [...states].find(([, state]) => state.running)?.[0] ?? null;
    },
    forget(id: string) {
      states.delete(id);
      for (const fn of listeners) fn();
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    begin(id: string, run: Run, text: string, attachments: ChatAttachment[] = []) {
      const old = get(id),
        now = Date.now();
      set(id, {
        ...old,
        run,
        running: true,
        lastSeq: 0,
        events: [],
        messages: [
          ...old.messages,
          {
            id: `${run.id}:user`,
            conversationId: id,
            role: 'user',
            text,
            attachments,
            reasoning: '',
            runId: run.id,
            createdAt: now,
          },
          {
            id: `${run.id}:assistant`,
            conversationId: id,
            role: 'assistant',
            text: '',
            reasoning: '',
            runId: run.id,
            createdAt: now + 1,
          },
        ],
      });
    },
    event(id: string, event: RunEvent) {
      const old = get(id);
      if (event.runId !== old.run?.id || event.seq <= old.lastSeq) return;
      const messages = old.messages.map((m) =>
        m.id !== `${event.runId}:assistant`
          ? m
          : {
              ...m,
              text: m.text + (event.type === 'text.delta' ? (event.data.text ?? '') : ''),
              reasoning:
                m.reasoning + (event.type === 'reasoning.delta' ? (event.data.text ?? '') : ''),
            },
      );
      const terminal = ['run.completed', 'run.failed', 'run.cancelled', 'run.interrupted'].includes(
        event.type,
      );
      if (terminal && !messages.at(-1)?.text && event.data.text)
        messages[messages.length - 1] = { ...messages.at(-1)!, text: event.data.text };
      set(id, {
        ...old,
        messages,
        events: [...old.events, event],
        lastSeq: event.seq,
        running: !terminal,
      });
    },
  };
}
export type ChatStore = ReturnType<typeof createChatStore>;
