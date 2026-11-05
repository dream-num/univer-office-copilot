import { useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import type { ChatAttachment } from '@univer-copilot/shared';
import { api } from '../../../api/client.ts';
import { Dialog } from '../../../components/dialog.tsx';
import { Button } from '../../../components/button.tsx';
import { attachmentLabel } from './card.tsx';

type TextPreview = { text: string; nextOffset: number | null; totalCharacters: number };
export function AttachmentPreview({ value, onClose }: { value: ChatAttachment; onClose(): void }) {
  const [text, setText] = useState(''),
    [next, setNext] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [imageVersion, setImageVersion] = useState(0),
    [imageLoading, setImageLoading] = useState(value.kind === 'image'),
    [error, setError] = useState('');
  async function load(offset = 0) {
    setBusy(true);
    setError('');
    try {
      const result = await api<TextPreview>(`/attachments/${value.id}?offset=${offset}`);
      setText((old) => (offset ? old + result.text : result.text));
      setNext(result.nextOffset);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Preview could not load.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (value.source === 'upload' && value.kind !== 'image') void load();
  }, [value.id]);
  return (
    <Dialog
      open
      wide
      title={value.name}
      description={`${attachmentLabel(value)}${value.pages ? ` · ${value.pages} pages` : ''}${value.width ? ` · ${value.width} × ${value.height}` : ''}`}
      onClose={onClose}
      footer={
        <div className="app:flex app:justify-end">
          <Button asChild variant="secondary">
            <a
              href={
                value.source === 'workspace'
                  ? `/?file=${value.id}`
                  : `/api/attachments/${value.id}/content`
              }
              target={value.source === 'workspace' ? '_blank' : undefined}
              rel="noopener noreferrer"
            >
              {value.source === 'workspace' ? <ExternalLink size={15} /> : <Download size={15} />}
              {value.source === 'workspace' ? 'Open file' : 'Download'}
            </a>
          </Button>
        </div>
      }
    >
      {value.note && <p className="attachment-note">{value.note}</p>}
      {value.source === 'workspace' ? (
        <p className="muted">
          Read-only context for Copilot. Open the file in another tab to inspect its content.
        </p>
      ) : value.kind === 'image' ? (
        <img
          key={imageVersion}
          className="attachment-image-preview"
          src={`/api/attachments/${value.id}/preview?v=${imageVersion}`}
          alt={value.name}
          onLoad={() => setImageLoading(false)}
          onError={() => {
            setImageLoading(false);
            setError('Image preview could not load.');
          }}
        />
      ) : (
        <pre className="attachment-text-preview">{text}</pre>
      )}
      {(busy || imageLoading) && (
        <p className="attachment-preview-status" role="status">
          <Loader2 size={15} className="attachment-spinner" />
          Loading preview…
        </p>
      )}
      {error && (
        <p role="alert" className="attachment-error-text">
          {error}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (value.kind === 'image') {
                setError('');
                setImageLoading(true);
                setImageVersion((old) => old + 1);
              } else void load(text.length);
            }}
          >
            Retry
          </Button>
        </p>
      )}
      {next !== null && !error && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void load(next)}
        >
          Show more
        </Button>
      )}
    </Dialog>
  );
}
