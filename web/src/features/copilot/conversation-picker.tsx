import { useEffect, useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Check,
  ChevronDown,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type { Conversation } from '@univer-copilot/shared';
import { api } from '../../api/client.ts';
import { Button } from '../../components/button.tsx';
import { Input } from '../../components/input.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/popover.tsx';
import { MenuContent, MenuItem, MenuSeparator } from '../../components/menu.tsx';
import { TextEntryDialog } from '../../components/text-entry-dialog.tsx';
import { ConfirmDialog } from '../../components/confirm-dialog.tsx';

function dateGroup(timestamp: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const week = new Date(today);
  week.setDate(today.getDate() - 7);
  return timestamp >= +today
    ? 'Today'
    : timestamp >= +yesterday
      ? 'Yesterday'
      : timestamp >= +week
        ? 'Previous 7 days'
        : 'Older';
}

export function ConversationPicker({
  fileId,
  value,
  version,
  disabled,
  creating,
  activeId,
  onSelect,
  onNew,
  onRenamed,
  onRemoved,
}: {
  fileId: string;
  value: Conversation | null;
  version: number;
  disabled: boolean;
  creating: boolean;
  activeId: string | null;
  onSelect(value: Conversation): Promise<void>;
  onNew(): Promise<void>;
  onRenamed(value: Conversation): void;
  onRemoved(id: string): Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [items, setItems] = useState<Conversation[]>([]),
    [loading, setLoading] = useState(false),
    [more, setMore] = useState(false),
    [error, setError] = useState(''),
    [renaming, setRenaming] = useState<Conversation | null>(null),
    [deleting, setDeleting] = useState<Conversation | null>(null);
  const search = useRef<HTMLInputElement>(null),
    sequence = useRef(0),
    managing = useRef(false);
  const cursor = items.at(-1);
  async function load(append = false) {
    const request = ++sequence.current;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ fileId, q: query });
    if (append && cursor) {
      params.set('before', String(cursor.updatedAt));
      params.set('beforeId', cursor.id);
    }
    try {
      const result = await api<{ conversations: Conversation[] }>(`/conversations?${params}`);
      if (request !== sequence.current) return;
      setItems((old) => (append ? [...old, ...result.conversations] : result.conversations));
      setMore(result.conversations.length === 50);
    } catch (cause) {
      if (request === sequence.current)
        setError(cause instanceof Error ? cause.message : 'Unable to load conversations.');
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => void load(), query ? 180 : 0);
    return () => {
      clearTimeout(timer);
      sequence.current++;
    };
  }, [open, query, fileId, version]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  async function select(conversation: Conversation) {
    setLoading(true);
    setError('');
    try {
      await onSelect(conversation);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open this conversation.');
    } finally {
      setLoading(false);
    }
  }
  function manage(conversation: Conversation, kind: 'rename' | 'delete') {
    managing.current = true;
    setOpen(false);
    if (kind === 'rename') setRenaming(conversation);
    else setDeleting(conversation);
  }
  function closeManagement() {
    setRenaming(null);
    setDeleting(null);
    managing.current = false;
    setOpen(true);
  }
  return (
    <>
      <Popover
        modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setLoading(true);
            managing.current = false;
            setQuery('');
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="conversation-trigger"
            aria-label="Conversation history"
            disabled={disabled}
            tooltip={value ? `${value.title} · Switch conversation` : 'Choose a conversation'}
          >
            <span>{value?.title ?? 'Conversations'}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="conversation-picker app:flex app:w-96 app:flex-col app:overflow-hidden app:p-2"
          aria-label="Conversation history"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            search.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            if (managing.current) event.preventDefault();
          }}
        >
          <div className="conversation-picker-search">
            <Search size={15} aria-hidden="true" />
            <Input
              ref={search}
              aria-label="Search conversations"
              placeholder="Search title or message…"
              value={query}
              className="app:pl-9"
              onChange={(event) => {
                setQuery(event.target.value);
                setLoading(true);
                setItems([]);
                setMore(false);
              }}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="conversation-new"
            disabled={creating || loading}
            onClick={async () => {
              try {
                await onNew();
                setOpen(false);
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : 'Unable to create a conversation.',
                );
              }
            }}
          >
            <Plus size={15} aria-hidden="true" />
            New conversation
          </Button>
          <div className="conversation-picker-list" aria-busy={loading}>
            {error ? (
              <div className="conversation-picker-empty" role="alert">
                <p>{error}</p>
                <Button variant="secondary" size="sm" onClick={() => void load()}>
                  Try again
                </Button>
              </div>
            ) : (
              <>
                {!items.length && (
                  <p className="conversation-picker-empty" role="status">
                    {loading
                      ? 'Loading conversations…'
                      : query
                        ? 'No conversations match your search.'
                        : 'No conversations yet.'}
                  </p>
                )}
                {items.map((item, index) => {
                  const group = dateGroup(item.updatedAt),
                    previous = items[index - 1];
                  return (
                    <div key={item.id}>
                      {(!previous || dateGroup(previous.updatedAt) !== group) && (
                        <p className="conversation-date-group">{group}</p>
                      )}
                      <div className="conversation-option" data-current={item.id === value?.id}>
                        <button
                          className="conversation-option-main"
                          aria-label={item.title}
                          aria-current={item.id === value?.id ? 'true' : undefined}
                          disabled={loading}
                          onClick={() => void select(item)}
                        >
                          <span className="conversation-option-title">{item.title}</span>
                          {query && item.preview ? (
                            <span className="conversation-option-preview">{item.preview}</span>
                          ) : null}
                          <span className="conversation-option-meta">
                            {item.mode === 'edit' ? 'Edit' : 'Ask'}
                            <span aria-hidden="true">·</span>
                            {new Date(item.updatedAt).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                        </button>
                        {item.id === activeId ? (
                          <Loader2
                            size={14}
                            className="conversation-running"
                            aria-label="Running"
                          />
                        ) : item.id === value?.id ? (
                          <Check size={14} aria-label="Current conversation" />
                        ) : null}
                        <DropdownMenu.Root modal={false}>
                          <DropdownMenu.Trigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Manage ${item.title}`}
                              className="app:shrink-0"
                            >
                              <MoreHorizontal size={16} />
                            </Button>
                          </DropdownMenu.Trigger>
                          <MenuContent align="end" className="app:z-[2070]">
                            <MenuItem onSelect={() => manage(item, 'rename')}>
                              <Pencil size={14} />
                              Rename
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem
                              disabled={item.id === activeId}
                              className="app:text-red-600"
                              onSelect={() => manage(item, 'delete')}
                            >
                              <Trash2 size={14} />
                              Delete conversation
                            </MenuItem>
                          </MenuContent>
                        </DropdownMenu.Root>
                      </div>
                    </div>
                  );
                })}
                {more && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="conversation-new"
                    disabled={loading}
                    onClick={() => void load(true)}
                  >
                    {loading ? 'Loading…' : 'Load more conversations'}
                  </Button>
                )}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <TextEntryDialog
        open={!!renaming}
        onClose={closeManagement}
        title="Rename conversation"
        label="Conversation name"
        initialValue={renaming?.title}
        confirmLabel="Save name"
        onSubmit={async (title) => {
          if (!renaming) return;
          await api(`/conversations/${renaming.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ title }),
          });
          onRenamed({ ...renaming, title });
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={closeManagement}
        title="Delete conversation?"
        description="This conversation and its share links will be deleted. File content and versions will be preserved."
        confirmLabel="Delete conversation"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/conversations/${deleting.id}`, { method: 'DELETE' });
          await onRemoved(deleting.id);
        }}
      />
    </>
  );
}
