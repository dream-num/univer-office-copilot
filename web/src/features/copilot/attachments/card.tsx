import { FileText, ImageIcon, Loader2, RotateCcw, X } from 'lucide-react';
import type { ChatAttachment, FileType } from '@univer-copilot/shared';
import { Button } from '../../../components/button.tsx';
import { ProductIcon } from '../../../components/product-icon.tsx';
import type { DraftAttachment } from './state.ts';

export function attachmentLabel(value: ChatAttachment) {
  if (value.source === 'workspace')
    return value.kind === 'doc'
      ? value.documentFlavor === 'traditional'
        ? 'Paged document'
        : 'Modern document'
      : ((
          {
            sheet: 'Spreadsheet',
            slide: 'Presentation',
            base: 'Relational table',
            board: 'Canvas',
          } as Record<string, string>
        )[value.kind] ?? 'Workspace file');
  return (
    ({ pdf: 'PDF', image: 'Image', markdown: 'Markdown', text: 'Text' } as Record<string, string>)[
      value.kind
    ] ?? 'File'
  );
}
function sizeLabel(size?: number) {
  return size === undefined
    ? ''
    : size < 1024
      ? `${size} B`
      : size < 1024 * 1024
        ? `${Math.ceil(size / 1024)} KB`
        : `${(size / 1024 / 1024).toFixed(1)} MB`;
}
export function AttachmentIcon({ value }: { value?: ChatAttachment }) {
  if (value?.source === 'workspace')
    return (
      <ProductIcon
        type={value.kind as FileType}
        documentFlavor={value.documentFlavor}
        emoji={value.emoji}
        size={20}
      />
    );
  if (value?.kind === 'image')
    return (
      <img src={`/api/attachments/${value.id}/preview`} alt="" loading="lazy" draggable={false} />
    );
  return <FileText size={20} aria-hidden="true" />;
}
export function AttachmentCard({
  value,
  draft,
  onPreview,
  onRemove,
  onRetry,
}: {
  value?: ChatAttachment;
  draft?: DraftAttachment;
  onPreview(value: ChatAttachment): void;
  onRemove?(): void;
  onRetry?(): void;
}) {
  const name = draft?.name ?? value!.name;
  const busy = draft && ['queued', 'uploading', 'processing'].includes(draft.phase);
  const detail =
    draft?.phase === 'queued'
      ? 'Waiting…'
      : draft?.phase === 'uploading'
        ? `Uploading ${draft.progress ?? 0}%`
        : draft?.phase === 'processing'
          ? 'Processing…'
          : draft?.phase === 'error'
            ? 'Upload failed'
            : value?.kind === 'pdf' && value.note
              ? 'PDF · Needs OCR'
              : `${value ? attachmentLabel(value) : 'File'}${draft?.file?.size || value?.size ? ` · ${sizeLabel(draft?.file?.size ?? value?.size)}` : value?.source === 'workspace' ? ' · Workspace' : ''}`;
  return (
    <div className={`attachment-card${draft?.phase === 'error' ? ' attachment-error' : ''}`}>
      <button
        type="button"
        className="attachment-open"
        disabled={!value || !!busy}
        aria-label={`Preview ${name}`}
        title={value?.note ?? name}
        onClick={() => value && onPreview(value)}
      >
        <span className="attachment-icon">
          {busy ? (
            <Loader2 size={19} className="attachment-spinner" aria-hidden="true" />
          ) : !value && /\.(png|jpe?g|webp|gif)$/i.test(name) ? (
            <ImageIcon size={20} />
          ) : (
            <AttachmentIcon value={value} />
          )}
        </span>
        <span className="attachment-copy">
          <span className="attachment-name">{name}</span>
          <span className="attachment-detail" role={busy ? 'status' : undefined}>
            {detail}
          </span>
        </span>
      </button>
      <div className="attachment-actions">
        {draft?.phase === 'error' && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Retry ${name}`}
            onClick={onRetry}
          >
            <RotateCcw size={13} />
          </Button>
        )}
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove attachment ${name}`}
            onClick={onRemove}
          >
            <X size={13} />
          </Button>
        )}
      </div>
      {draft?.phase === 'error' && (
        <p className="attachment-error-text" role="alert">
          {draft.error}
        </p>
      )}
    </div>
  );
}
