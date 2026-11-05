import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { History, SquarePen, Share2, Scan, X, Loader2, ChevronDown, Upload } from 'lucide-react';
import {
  runEventSchema,
  type Conversation,
  type Message,
  type Mode,
  type ModelProfile,
  type OfficeFile,
  type Run,
  type RunChange,
  type RunEvent,
  type Location,
  type ChatAttachment,
} from '@univer-copilot/shared';
import { api, post, ndjson } from '../../api/client.ts';
import { Button } from '../../components/button.tsx';
import { MenuContent, MenuRadioItem } from '../../components/menu.tsx';
import { ChatThread } from './assistant-ui/thread.tsx';
import { ChatWelcome } from './assistant-ui/welcome.tsx';
import { createChatStore } from './state/store.ts';
import { ConversationPicker } from './conversation-picker.tsx';
import { ModelPicker } from './model-picker.tsx';
import { TurnChanges } from './turn-changes.tsx';
import {
  AttachmentTools,
  DraftAttachments,
  AttachmentPreview,
  useAttachments,
  useAttachmentDrop,
} from './attachments/index.tsx';
import type { EditorHandle } from '../editor/index.ts';

export function Copilot({
  file,
  editorReady,
  availableFiles,
  onFilesImported,
  profiles,
  keys,
  onSettings,
  onProfileUpdated,
  flush,
  selection,
  onShare,
  onLocate,
  onHistory,
  compareVersions,
  onRestored,
  historyOpen: fileHistoryOpen,
  onError,
}: {
  file: OfficeFile;
  editorReady: boolean;
  availableFiles: OfficeFile[];
  onFilesImported(): Promise<void>;
  profiles: ModelProfile[];
  keys: Record<string, string>;
  onSettings(): void;
  onProfileUpdated(profile: ModelProfile): void;
  flush(): Promise<void>;
  selection(): Location | null;
  onShare(id: string): void;
  onLocate(location: Location): void;
  onHistory(): void;
  compareVersions: EditorHandle['compareVersions'];
  onRestored(): void;
  historyOpen: boolean;
  onError(message: string): void;
}) {
  const store = useMemo(createChatStore, []),
    [conversation, setConversation] = useState<Conversation | null>(null),
    [conversationVersion, setConversationVersion] = useState(0),
    [creating, setCreating] = useState(false),
    [mode, setMode] = useState<Mode>('ask'),
    [profileId, setProfileId] = useState(''),
    [changes, setChanges] = useState<RunChange[] | null>(null),
    [sendingId, setSendingId] = useState<string | null>(null),
    [fixedSelection, setFixedSelection] = useState<Location | null>(null),
    [previewAttachment, setPreviewAttachment] = useState<ChatAttachment | null>(null);
  const openSequence = useRef(0);
  const creatingRef = useRef(false);
  const memories = useRef(
    new Map<string, { text: string; mode?: Mode; selection?: Location | null }>(),
  );
  const serverKeyAvailable = profiles.find(
    (profile) => profile.id === profileId,
  )?.serverKeyAvailable;
  const state = useSyncExternalStore(
    store.subscribe,
    useCallback(() => store.get(conversation?.id ?? ''), [store, conversation?.id]),
  );
  const activeConversationId = useSyncExternalStore(store.subscribe, store.activeConversation);
  const sending = sendingId === conversation?.id;
  const busyConversationId = sendingId ?? activeConversationId;
  const runningElsewhere = !!busyConversationId && busyConversationId !== conversation?.id;
  const attachments = useAttachments(conversation?.id, onFilesImported, onError);
  const composerDisabled = !editorReady || !conversation || fileHistoryOpen || runningElsewhere;
  const attachmentDisabled = composerDisabled || state.running || sending;
  const drop = useAttachmentDrop(attachmentDisabled, attachments.addFiles);
  const imageModelRequired =
    attachments.selected.some((value) => value.kind === 'image') &&
    !profiles.find((value) => value.id === profileId)?.imageInput;
  useEffect(() => {
    if (!profiles.some((p) => p.id === profileId)) setProfileId(profiles[0]?.id ?? '');
  }, [profiles]);
  async function open(value: Conversation) {
    const sequence = ++openSequence.current;
    if (conversation)
      memories.current.set(conversation.id, {
        ...memories.current.get(conversation.id),
        text: memories.current.get(conversation.id)?.text ?? '',
        mode,
        selection: fixedSelection,
      });
    const [result, execution] = await Promise.all([
      api<{ conversation: Conversation; messages: Message[] }>(`/conversations/${value.id}`),
      api<{ runs: Run[] }>(`/conversations/${value.id}/runs`),
    ]);
    if (sequence !== openSequence.current || result.conversation.fileId !== file.id) return;
    store.hydrate(value.id, result.messages, execution.runs[0] ?? null);
    setConversation(result.conversation);
    const memory = memories.current.get(value.id);
    setMode(file.role === 'viewer' ? 'ask' : (memory?.mode ?? result.conversation.mode));
    setFixedSelection(memory?.selection ?? null);
    setChanges(null);
    try {
      sessionStorage.setItem(`copilot.conversation:${file.id}`, value.id);
    } catch {
      /* Storage may be unavailable. */
    }
  }
  async function newConversation() {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const result = await post<{ conversation: Conversation }>('/conversations', {
        fileId: file.id,
      });
      await open(result.conversation);
      setConversationVersion((v) => v + 1);
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }
  function changeMode(next: Mode) {
    setMode(next);
    if (!conversation) return;
    const id = conversation.id;
    memories.current.set(id, {
      ...memories.current.get(id),
      text: memories.current.get(id)?.text ?? '',
      mode: next,
    });
    void api(`/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ mode: next }) })
      .then(() => setConversationVersion((v) => v + 1))
      .catch((error) => onError(error.message));
  }
  async function removed(id: string) {
    memories.current.delete(id);
    attachments.forget(id);
    store.forget(id);
    setConversationVersion((v) => v + 1);
    if (id !== conversation?.id) return;
    setConversation(null);
    try {
      const result = await api<{ conversations: Conversation[] }>(
        `/conversations?fileId=${file.id}`,
      );
      if (result.conversations[0]) await open(result.conversations[0]);
      else await newConversation();
    } catch (error) {
      onError(
        error instanceof Error ? error.message : 'Choose another conversation or create a new one.',
      );
    }
  }
  useEffect(() => {
    let disposed = false;
    const sequence = ++openSequence.current;
    void (async () => {
      const { conversations: list } = await api<{ conversations: Conversation[] }>(
        `/conversations?fileId=${file.id}`,
      );
      let remembered: string | null = null;
      try {
        remembered = sessionStorage.getItem(`copilot.conversation:${file.id}`);
      } catch {
        /* Storage may be unavailable. */
      }
      let selected = list.find((c) => c.id === remembered);
      if (remembered && !selected)
        try {
          const result = await api<{ conversation: Conversation }>(
            `/conversations/${encodeURIComponent(remembered)}`,
          );
          if (result.conversation.fileId === file.id) selected = result.conversation;
        } catch {
          /* A deleted or inaccessible selection falls back to this user's list. */
        }
      if (disposed || sequence !== openSequence.current) return;
      if (selected ?? list[0]) await open((selected ?? list[0])!);
      else await newConversation();
    })().catch((error) => {
      if (!disposed) onError(error.message);
    });
    return () => {
      disposed = true;
      ++openSequence.current;
    };
  }, [file.id]);
  useEffect(() => {
    if (!conversation || !state.running || !state.run) return;
    const id = conversation.id,
      runId = state.run.id;
    let disposed = false,
      timer: ReturnType<typeof setTimeout>;
    async function recover() {
      try {
        const cursor = store.get(id).lastSeq;
        const [updates, execution] = await Promise.all([
          api<{ events: RunEvent[] }>(`/agent/runs/${runId}/events?after=${cursor}`),
          api<{ run: Run }>(`/agent/runs/${runId}`),
        ]);
        if (disposed) return;
        for (const event of updates.events) store.event(id, runEventSchema.parse(event));
        if (!['running', 'queued'].includes(execution.run.status)) {
          const saved = await api<{ messages: Message[]; conversation?: Conversation }>(
            `/conversations/${id}`,
          );
          if (!disposed) {
            if (saved.conversation)
              setConversation((old) => (old?.id === id ? saved.conversation! : old));
            setConversationVersion((v) => v + 1);
            store.set(id, {
              ...store.get(id),
              run: execution.run,
              running: false,
              messages: saved.messages,
            });
          }
          return;
        }
      } catch (error) {
        if (!disposed)
          onError(error instanceof Error ? error.message : 'Unable to recover this run.');
      }
      if (!disposed) timer = setTimeout(() => void recover(), 1500);
    }
    void recover();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [conversation?.id, state.run?.id, state.running]);
  async function send(text: string) {
    if (!conversation) return;
    if (fileHistoryOpen) throw new Error('Close file history before sending.');
    if (attachments.pending || attachments.failed)
      throw new Error('Wait for uploads to finish, or remove failed attachments.');
    if (imageModelRequired)
      throw new Error('Choose an image-enabled model to send image attachments.');
    const key = keys[profileId];
    if (!key && !serverKeyAvailable) {
      onSettings();
      throw new Error('Configure an API key before sending.');
    }
    const id = conversation.id,
      fixedFile = file,
      selectedAttachments = attachments.selected,
      currentSelection = fixedSelection ?? selection();
    setSendingId(id);
    try {
      await flush();
      const response = await fetch('/api/agent/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: id,
          fileId: fixedFile.id,
          mode,
          profileId,
          apiKey: key || undefined,
          referencedFileIds: selectedAttachments
            .filter((value) => value.source === 'workspace')
            .map((value) => value.id),
          attachmentIds: selectedAttachments
            .filter((value) => value.source === 'upload')
            .map((value) => value.id),
          text,
          selection: currentSelection
            ? {
                sheetId: currentSelection.sheetId,
                range: currentSelection.range,
                elementId: currentSelection.elementId,
                paragraphId: currentSelection.paragraphId,
              }
            : undefined,
        }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: { message: string } };
        throw new Error(data.error?.message ?? 'Unable to start this conversation.');
      }
      for await (const frame of ndjson(response)) {
        const value = frame as { run?: Run; event?: unknown };
        if (value.run) {
          store.begin(id, value.run, text, selectedAttachments);
          attachments.clear(id);
        }
        if (value.event) store.event(id, runEventSchema.parse(value.event));
      }
      const final = await api<{ messages: Message[]; conversation?: Conversation }>(
        `/conversations/${id}`,
      );
      const old = store.get(id);
      store.set(id, { ...old, messages: final.messages, running: false });
      if (final.conversation)
        setConversation((current) => (current?.id === id ? final.conversation! : current));
      setConversationVersion((v) => v + 1);
    } catch (error) {
      const old = store.get(id);
      store.set(id, { ...old, running: !!old.run && old.running });
      onError(
        error instanceof Error
          ? error.message
          : 'The connection was interrupted. Reopen the conversation to recover its saved state.',
      );
      throw error;
    } finally {
      setSendingId(null);
    }
  }
  async function showChanges(runId: string) {
    if (!conversation) return;
    try {
      const result = await api<{ changes: RunChange[] }>(
        `/conversations/${conversation.id}/runs/${runId}/changes`,
      );
      setChanges(result.changes);
    } catch (error) {
      onError((error as Error).message);
    }
  }
  const lastTool = state.events.findLast(
    (e) => e.type === 'tool.started' || e.type === 'tool.completed' || e.type === 'tool.failed',
  );
  const latestEvent = state.events.at(-1);
  const activityLabel =
    state.running && lastTool?.type === 'tool.started'
      ? ['office_api', 'office_skill', 'office_resources', 'office_source'].includes(
          lastTool.data.name ?? '',
        )
        ? 'Preparing…'
        : ['office_visual', 'office_verify'].includes(String(lastTool.data.name))
          ? 'Checking changes…'
          : [
                'inspect',
                'sheet.read',
                'facade.read',
                'script.read',
                'script.verify',
                'doc.markdown.read',
                'read_attachment',
                'read_reference',
              ].includes(lastTool.data.name ?? '')
            ? 'Reading file…'
            : 'Updating file…'
      : latestEvent?.type === 'reasoning.delta'
        ? 'Thinking…'
        : latestEvent?.type === 'text.delta'
          ? 'Responding…'
          : 'Waiting for response…';
  return (
    <aside className="copilot-pane" aria-label="Copilot" {...drop.handlers}>
      {drop.active && (
        <div className="attachment-drop-overlay" role="status">
          <Upload size={26} />
          <strong>
            {attachmentDisabled ? 'Finish the current request first' : 'Drop files to attach'}
          </strong>
          <span>Office, PDF, images, Markdown and text · Up to 20 MB each</span>
        </div>
      )}
      <header className="copilot-header">
        <ConversationPicker
          fileId={file.id}
          value={conversation}
          version={conversationVersion}
          disabled={fileHistoryOpen}
          creating={creating}
          activeId={busyConversationId}
          onSelect={open}
          onNew={newConversation}
          onRenamed={(updated) => {
            setConversation((current) => (current?.id === updated.id ? updated : current));
            setConversationVersion((v) => v + 1);
          }}
          onRemoved={removed}
        />
        <div className="actions">
          <Button
            size="icon"
            variant="ghost"
            aria-label="New conversation"
            disabled={creating || fileHistoryOpen}
            onClick={() => void newConversation().catch((error) => onError(error.message))}
          >
            {creating ? (
              <Loader2 size={17} className="conversation-running" aria-hidden="true" />
            ) : (
              <SquarePen size={17} aria-hidden="true" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Share conversation"
            disabled={!conversation || fileHistoryOpen}
            onClick={() => conversation && onShare(conversation.id)}
          >
            <Share2 size={17} aria-hidden="true" />
          </Button>
        </div>
      </header>
      {state.run?.status === 'interrupted' && (
        <p className="run-notice" role="status">
          {state.run.error}
        </p>
      )}
      {fileHistoryOpen && (
        <p className="history-pause" role="status">
          <History size={14} aria-hidden="true" />
          Close file history to send a message.
        </p>
      )}
      {runningElsewhere && (
        <div className="conversation-background" role="status">
          <span>Copilot is running in another conversation.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void api<{ conversation: Conversation }>(`/conversations/${busyConversationId}`)
                .then((result) => open(result.conversation))
                .catch((error) => onError(error.message));
            }}
          >
            Open
          </Button>
        </div>
      )}
      <ChatThread
        key={conversation?.id ?? 'opening'}
        initialDraft={memories.current.get(conversation?.id ?? '')?.text ?? ''}
        onDraftChange={(text) => {
          if (conversation)
            memories.current.set(conversation.id, {
              ...memories.current.get(conversation.id),
              text,
            });
        }}
        emptyState={(focusComposer) =>
          !attachments.items.length && (
            <ChatWelcome
              type={file.type}
              canEdit={file.role !== 'viewer'}
              disabled={composerDisabled}
              setupLabel={
                !keys[profileId] && !serverKeyAvailable
                  ? profiles.length
                    ? 'Configure model'
                    : 'Add a model'
                  : undefined
              }
              onSettings={onSettings}
              onExample={() => {
                changeMode(file.role === 'viewer' ? 'ask' : 'edit');
                focusComposer();
              }}
            />
          )
        }
        messages={state.messages}
        running={state.running || sending}
        activity={{ runId: state.running ? state.run?.id : undefined, label: activityLabel }}
        onSend={send}
        onStop={() => {
          if (state.run) void post(`/agent/runs/${state.run.id}/cancel`);
        }}
        onHistory={(runId) => void showChanges(runId)}
        onPreviewAttachment={setPreviewAttachment}
        disabled={composerDisabled}
        sendDisabled={attachments.pending || attachments.failed || imageModelRequired}
        composerAttachments={
          <>
            <DraftAttachments
              state={attachments}
              onPreview={setPreviewAttachment}
              imageModelRequired={imageModelRequired}
            />
            {fixedSelection && (
              <div className="composer-selection">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="context-chip"
                  onClick={() => setFixedSelection(null)}
                  aria-label={`Remove selected context: ${fixedSelection.label}`}
                  tooltip="Remove selected context"
                >
                  {fixedSelection.label}
                  <X size={12} />
                </Button>
              </div>
            )}
          </>
        }
        composerTools={
          <>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="composer-mode"
                  aria-label="Copilot mode"
                  tooltip={
                    mode === 'ask'
                      ? 'Ask questions without changing the file'
                      : 'Edit the file directly'
                  }
                  disabled={attachmentDisabled}
                >
                  {mode === 'edit' ? 'Edit' : 'Ask'}
                  <ChevronDown size={12} aria-hidden="true" />
                </Button>
              </DropdownMenu.Trigger>
              <MenuContent side="top" align="start" sideOffset={8} className="app:w-64">
                <DropdownMenu.RadioGroup
                  value={mode}
                  onValueChange={(value) => changeMode(value as Mode)}
                >
                  <MenuRadioItem value="ask" aria-label="Ask" textValue="Ask">
                    <span className="app:grid app:gap-0.5">
                      <span className="app:font-medium">Ask</span>
                      <span className="app:text-xs app:text-zinc-500">
                        Read and explain without edits
                      </span>
                    </span>
                  </MenuRadioItem>
                  <MenuRadioItem
                    value="edit"
                    aria-label="Edit"
                    textValue="Edit"
                    disabled={file.role === 'viewer'}
                  >
                    <span className="app:grid app:gap-0.5">
                      <span className="app:font-medium">Edit</span>
                      <span className="app:text-xs app:text-zinc-500">
                        {file.role === 'viewer'
                          ? 'You have view-only access'
                          : 'Make changes directly'}
                      </span>
                    </span>
                  </MenuRadioItem>
                </DropdownMenu.RadioGroup>
              </MenuContent>
            </DropdownMenu.Root>
            <ModelPicker
              profiles={profiles}
              keys={keys}
              value={profileId}
              disabled={state.running || sending || fileHistoryOpen}
              onChange={setProfileId}
              onSettings={onSettings}
              onUpdated={onProfileUpdated}
              onError={onError}
            />
            <div className="composer-context-actions">
              <AttachmentTools
                state={attachments}
                files={availableFiles}
                currentFileId={file.id}
                disabled={attachmentDisabled}
              />
              {file.type === 'sheet' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Use selection"
                  tooltip="Use selected cells as context"
                  disabled={attachmentDisabled}
                  onClick={() => {
                    const selected = selection();
                    if (selected) setFixedSelection(selected);
                  }}
                >
                  <Scan size={17} aria-hidden="true" />
                </Button>
              )}
            </div>
          </>
        }
      />
      {previewAttachment && (
        <AttachmentPreview
          key={previewAttachment.id}
          value={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
      {changes !== null && (
        <TurnChanges
          file={file}
          changes={changes}
          running={state.running}
          historyOpen={fileHistoryOpen}
          flush={flush}
          compare={compareVersions}
          onClose={() => setChanges(null)}
          onHistory={onHistory}
          onRestored={onRestored}
          onLocate={onLocate}
        />
      )}
    </aside>
  );
}
