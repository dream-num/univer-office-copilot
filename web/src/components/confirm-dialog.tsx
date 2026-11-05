import { useEffect, useRef, useState } from 'react';
import { Dialog } from './dialog.tsx';
import { Button } from './button.tsx';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm(): Promise<void>;
  onClose(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) setError('');
  }, [open]);
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={title}
      description={description}
      initialFocus={cancel}
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <Button ref={cancel} variant="secondary" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant={destructive ? 'destructive' : 'default'}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await onConfirm();
              onClose();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : 'The change could not be completed. Try again.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Please wait…' : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
