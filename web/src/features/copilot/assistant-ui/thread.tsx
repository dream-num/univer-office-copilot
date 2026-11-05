import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
  type RefObject,
} from 'react';
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { ArrowUp, ChevronDown, ListChecks, Square } from 'lucide-react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatAttachment, Message } from '@univer-copilot/shared';
import { Button } from '../../../components/button.tsx';
import { AttachmentCard } from '../attachments/card.tsx';

const History = createContext<{
  open(runId: string): void;
  activeRunId?: string;
  preview(value: ChatAttachment): void;
}>({
  open: () => {},
  preview: () => {},
});
function ComposerInput({
  disabled,
  input,
}: {
  disabled: boolean;
  input: RefObject<HTMLTextAreaElement | null>;
}) {
  const [, setWidth] = useState(0);
  useLayoutEffect(() => {
    // The autosizer handles window resizing; panel resizing also needs a render.
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(input.current!.parentElement!);
    return () => observer.disconnect();
  }, []);
  return (
    <ComposerPrimitive.Input
      ref={input}
      className="composer-input"
      placeholder="Message Copilot…"
      aria-label="Message Copilot"
      minRows={2}
      maxRows={10}
      disabled={disabled}
    />
  );
}
function MessageText({ text }: { text: string }) {
  const role = useAuiState((s) => s.message.role);
  if (role === 'assistant')
    return (
      <MarkdownTextPrimitive
        className="message-text message-markdown"
        remarkPlugins={[remarkGfm]}
        components={{ img: PreviewImage }}
      />
    );
  return <div className="message-text">{text}</div>;
}
function PreviewImage({ src, alt }: ComponentProps<'img'>) {
  return typeof src === 'string' &&
    /^\/api\/office\/previews\/[a-zA-Z0-9-]+\/[a-f0-9-]{36}\.png$/.test(src) ? (
    <img src={src} alt={alt ?? 'Office preview'} loading="lazy" />
  ) : (
    <span>{alt ?? 'Image'}</span>
  );
}
function MessageReasoning({ text }: { text: string }) {
  return (
    <details className="reasoning">
      <summary>
        Thought process
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div className="message-text">{text}</div>
    </details>
  );
}
const messageParts = { Text: MessageText, Reasoning: MessageReasoning };
function ChatMessage() {
  const message = useAuiState((s) => s.message),
    { open: onHistory, activeRunId, preview } = useContext(History);
  const runId = message.metadata.custom?.runId;
  const attachments = message.metadata.custom?.attachments as ChatAttachment[] | undefined;
  return (
    <MessagePrimitive.Root className={`chat-message chat-message-${message.role}`}>
      <span className="sr-only">{message.role === 'user' ? 'You' : 'Copilot'}:</span>
      {!!attachments?.length && (
        <div className="message-attachments attachment-grid">
          {attachments.map((value) => (
            <AttachmentCard key={`${value.source}:${value.id}`} value={value} onPreview={preview} />
          ))}
        </div>
      )}
      <MessagePrimitive.Parts components={messageParts} />
      {message.role === 'assistant' && typeof runId === 'string' && runId !== activeRunId && (
        <Button
          variant="ghost"
          size="sm"
          className="message-history"
          aria-label="View changes"
          onClick={() => onHistory(runId)}
        >
          <ListChecks size={15} aria-hidden="true" />
          <span>View changes</span>
        </Button>
      )}
    </MessagePrimitive.Root>
  );
}
const convertMessage = (message: Message): ThreadMessageLike => ({
  id: message.runId ? `${message.runId}:${message.role}` : message.id,
  role: message.role,
  content: [
    ...(message.reasoning ? [{ type: 'reasoning' as const, text: message.reasoning }] : []),
    { type: 'text' as const, text: message.text },
  ],
  createdAt: new Date(message.createdAt),
  metadata: { custom: { runId: message.runId, attachments: message.attachments ?? [] } },
});
export function ChatThread({
  messages,
  running,
  activity,
  onSend,
  onStop,
  onHistory,
  disabled,
  composerTools,
  composerAttachments,
  sendDisabled = false,
  onPreviewAttachment,
  emptyState,
  initialDraft = '',
  onDraftChange,
}: {
  initialDraft?: string;
  onDraftChange?(text: string): void;
  messages: Message[];
  running: boolean;
  activity: { runId?: string; label: string };
  onSend(text: string): Promise<void>;
  onStop(): void;
  onHistory(runId: string): void;
  disabled: boolean;
  composerTools: ReactNode;
  composerAttachments?: ReactNode;
  sendDisabled?: boolean;
  onPreviewAttachment(value: ChatAttachment): void;
  emptyState(focusComposer: () => void): ReactNode;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: running,
    convertMessage,
    onNew: async (message: AppendMessage) => {
      const text = message.content
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('\n');
      if (text.trim()) await onSend(text);
    },
    onCancel: async () => onStop(),
  });
  const draftBinding = useRef({ initialDraft, onDraftChange });
  useEffect(() => {
    runtime.thread.composer.setText(draftBinding.current.initialDraft);
    const save = () =>
      draftBinding.current.onDraftChange?.(runtime.thread.composer.getState().text);
    const unsubscribe = runtime.thread.composer.subscribe(save);
    return unsubscribe;
  }, [runtime]);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <History.Provider
        value={{
          open: onHistory,
          activeRunId: running ? activity.runId : undefined,
          preview: onPreviewAttachment,
        }}
      >
        <ThreadPrimitive.Root className="chat-thread">
          <ThreadPrimitive.Viewport className="chat-viewport">
            {!messages.length &&
              !running &&
              emptyState(() => {
                requestAnimationFrame(() => {
                  const field = input.current;
                  field?.focus({ preventScroll: true });
                  field?.setSelectionRange(field.value.length, field.value.length);
                });
              })}
            <ThreadPrimitive.Messages
              components={{ UserMessage: ChatMessage, AssistantMessage: ChatMessage }}
            />
            {running && (
              <div className="chat-activity" role="status">
                <span className="chat-activity-pulse" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>{activity.label}</span>
              </div>
            )}
          </ThreadPrimitive.Viewport>
          <ComposerPrimitive.Root className="composer">
            {composerAttachments}
            <ComposerInput disabled={disabled} input={input} />
            <div className="composer-footer">
              <div className="composer-tools">{composerTools}</div>
              {running ? (
                <Button
                  size="icon"
                  className="composer-submit"
                  onClick={onStop}
                  aria-label="Stop Copilot"
                  tooltip="Stop Copilot. Saved changes remain."
                >
                  <Square size={11} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                </Button>
              ) : (
                <ComposerPrimitive.Send asChild>
                  <Button
                    size="icon"
                    className="composer-submit"
                    disabled={disabled || sendDisabled}
                    aria-label="Send message"
                  >
                    <ArrowUp size={18} aria-hidden="true" />
                  </Button>
                </ComposerPrimitive.Send>
              )}
            </div>
          </ComposerPrimitive.Root>
        </ThreadPrimitive.Root>
      </History.Provider>
    </AssistantRuntimeProvider>
  );
}
