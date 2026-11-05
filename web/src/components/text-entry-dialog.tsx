import { useEffect, useRef, useState } from 'react';
import { Dialog } from './dialog.tsx';
import { Button } from './button.tsx';
import { Field, Input } from './input.tsx';

export function TextEntryDialog({
  open,
  onClose,
  title,
  label,
  initialValue = '',
  confirmLabel,
  onSubmit,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel: string;
  onSubmit(value: string): Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError('');
    }
  }, [open, initialValue]);
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} title={title} initialFocus={input}>
      <form
        className="settings-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!value.trim() || busy) return;
          setBusy(true);
          setError('');
          try {
            await onSubmit(value.trim());
            onClose();
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : 'The change could not be saved. Try again.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field>
          {label}
          <Input
            ref={input}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
          />
        </Field>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !value.trim()}>{busy ? 'Saving…' : confirmLabel}</Button>
        </div>
      </form>
    </Dialog>
  );
}
