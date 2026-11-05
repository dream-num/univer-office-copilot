import { useEffect, useRef, useState, type DragEvent } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { FolderOpen, Paperclip, Upload, X } from 'lucide-react';
import { MAX_CHAT_ATTACHMENTS, type ChatAttachment, type OfficeFile } from '@univer-copilot/shared';
import { Button } from '../../../components/button.tsx';
import { MenuContent, MenuItem } from '../../../components/menu.tsx';
import { Dialog } from '../../../components/dialog.tsx';
import { Input, Checkbox } from '../../../components/input.tsx';
import { AttachmentCard, AttachmentIcon, attachmentLabel } from './card.tsx';
import { attachmentAccept, workspaceAttachment, type AttachmentState } from './state.ts';
export { useAttachments } from './state.ts';
export { AttachmentPreview } from './preview.tsx';
export { AttachmentCard } from './card.tsx';

export function AttachmentTools({
  state,
  files,
  currentFileId,
  disabled,
}: {
  state: AttachmentState;
  files: OfficeFile[];
  currentFileId: string;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState('');
  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        aria-label="Upload local files"
        accept={attachmentAccept}
        onChange={(event) => {
          state.addFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Attach files"
            tooltip="Add files from your device or workspace"
            disabled={disabled}
          >
            <Paperclip size={17} aria-hidden="true" />
          </Button>
        </DropdownMenu.Trigger>
        <MenuContent side="top" align="start" className="app:w-64">
          <MenuItem
            disabled={state.items.length >= MAX_CHAT_ATTACHMENTS}
            onSelect={() => input.current?.click()}
          >
            <Upload size={16} />
            Upload files
          </MenuItem>
          <MenuItem
            onSelect={() => {
              setQuery('');
              setOpen(true);
            }}
          >
            <FolderOpen size={16} />
            Add from workspace
          </MenuItem>
          <p className="attachment-menu-note">
            Office, PDF, images, Markdown and text
            <br />
            Up to 5 files · 20 MB each
          </p>
        </MenuContent>
      </DropdownMenu.Root>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Attach workspace files"
        description="Read-only context · Up to five files in total"
        footer={
          <div className="app:flex app:items-center app:justify-between app:gap-4">
            <span className="muted">
              {state.items.length} / {MAX_CHAT_ATTACHMENTS} attached
            </span>
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        }
      >
        <Input
          aria-label="Search workspace attachments"
          placeholder="Search files…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="attachment-workspace-list">
          {files
            .filter(
              (file) =>
                file.id !== currentFileId && file.name.toLowerCase().includes(query.toLowerCase()),
            )
            .map((file) => {
              const value = workspaceAttachment(file),
                checked = state.selected.some(
                  (selected) => selected.source === 'workspace' && selected.id === file.id,
                );
              return (
                <label className="attachment-workspace-row" key={file.id}>
                  <Checkbox
                    checked={checked}
                    disabled={!checked && state.items.length >= MAX_CHAT_ATTACHMENTS}
                    onChange={() => state.toggleWorkspace(file)}
                  />
                  <span className="attachment-icon">
                    <AttachmentIcon value={value} />
                  </span>
                  <span className="attachment-copy">
                    <span className="attachment-name">{file.name}</span>
                    <span className="attachment-detail">{attachmentLabel(value)}</span>
                  </span>
                </label>
              );
            })}
          {!files.some(
            (file) =>
              file.id !== currentFileId && file.name.toLowerCase().includes(query.toLowerCase()),
          ) && (
            <p className="empty-list">
              {query
                ? 'No matching files.'
                : 'No other workspace files yet. Upload a file from your device to get started.'}
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}
export function DraftAttachments({
  state,
  onPreview,
  imageModelRequired,
}: {
  state: AttachmentState;
  onPreview(value: ChatAttachment): void;
  imageModelRequired: boolean;
}) {
  return (
    <>
      {!!state.items.length && (
        <div className="attachment-grid" aria-label="Attached files">
          {state.items.map((item) => (
            <AttachmentCard
              key={item.key}
              draft={item}
              value={item.attachment}
              onPreview={onPreview}
              onRemove={() => state.remove(item.key)}
              onRetry={() => state.retry(item.key)}
            />
          ))}
        </div>
      )}
      {state.notice && (
        <div className="attachment-notice" role="alert">
          <span>{state.notice}</span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Dismiss attachment notice"
            onClick={state.dismissNotice}
          >
            <X size={13} />
          </Button>
        </div>
      )}
      {imageModelRequired && (
        <p className="attachment-note" role="status">
          Choose an image-enabled model to send image attachments.
        </p>
      )}
    </>
  );
}
export function useAttachmentDrop(disabled: boolean, addFiles: (files: File[]) => void) {
  const depth = useRef(0),
    [active, setActive] = useState(false);
  useEffect(() => {
    if (!active) return;
    const reset = () => {
      depth.current = 0;
      setActive(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') reset();
    };
    window.addEventListener('dragend', reset);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('dragend', reset);
      window.removeEventListener('keydown', escape);
    };
  }, [active]);
  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files');
  return {
    active,
    handlers: {
      onDragEnter(event: DragEvent) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current++;
        setActive(true);
      },
      onDragOver(event: DragEvent) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
      },
      onDragLeave(event: DragEvent) {
        if (!depth.current) return;
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setActive(false);
      },
      onDrop(event: DragEvent) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setActive(false);
        if (!disabled) addFiles(Array.from(event.dataTransfer.files));
      },
    },
  };
}
