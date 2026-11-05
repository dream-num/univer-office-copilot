import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { MAX_IMPORT_BYTES, type OfficeFile, type FileExportFormat } from '@univer-copilot/shared';
import { api } from '../../api/client.ts';
import { Button } from '../../components/button.tsx';
import { Dialog } from '../../components/dialog.tsx';
import { Field, Input } from '../../components/input.tsx';
import { Select } from '../../components/select.tsx';

export function FileImportDialog({
  onClose,
  onImported,
}: {
  onClose(): void;
  onImported(file: OfficeFile): Promise<void>;
}) {
  const [file, setFile] = useState<File>(),
    [target, setTarget] = useState('sheet');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const grid = /\.(xlsx|xls|csv|tsv)$/i.test(file?.name ?? '');
  return (
    <Dialog
      open
      title="Import file"
      description="Excel, CSV, Word, PowerPoint or Univer JSON · Up to 20 MB"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="app:flex app:flex-col app:gap-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!file) return;
          setError('');
          if (file.size > MAX_IMPORT_BYTES) {
            setError('Choose a file smaller than 20 MB.');
            return;
          }
          setBusy(true);
          try {
            const query = new URLSearchParams({ filename: file.name, ...(grid ? { target } : {}) });
            const result = await api<{ file: OfficeFile }>(`/files/import?${query}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/octet-stream' },
              body: file,
            });
            await onImported(result.file);
            onClose();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Import failed.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field>
          File
          <Input
            type="file"
            accept=".xlsx,.xls,.csv,.tsv,.docx,.pptx,.univer.json"
            disabled={busy}
            className="app:h-auto app:min-h-12 app:file:mr-3 app:file:rounded-md app:file:border-0 app:file:bg-zinc-100 app:file:px-3 app:file:py-1.5 app:file:font-medium app:file:text-zinc-700"
            onChange={(event) => {
              setFile(event.target.files?.[0]);
              setError('');
            }}
          />
        </Field>
        {grid && (
          <Field>
            Open as
            <Select
              label="Import as"
              value={target}
              onValueChange={setTarget}
              disabled={busy}
              options={[
                { value: 'sheet', label: 'Spreadsheet' },
                { value: 'base', label: 'Relational table' },
              ]}
            />
          </Field>
        )}
        {error && (
          <p role="alert" className="app:m-0 app:text-red-700">
            {error}
          </p>
        )}
        <div className="app:flex app:justify-end app:gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!file || busy}>
            <Upload size={15} />
            {busy ? 'Importing…' : 'Import'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function FileExportDialog({
  file,
  onClose,
  beforeExport,
}: {
  file: OfficeFile;
  onClose(): void;
  beforeExport(): Promise<void>;
}) {
  const [format, setFormat] = useState<FileExportFormat>(
    file.type === 'board' ? 'native' : 'office',
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const office =
    file.type === 'doc'
      ? 'Word (.docx)'
      : file.type === 'slide'
        ? 'PowerPoint (.pptx)'
        : 'Excel (.xlsx)';
  return (
    <Dialog
      open
      title="Export file"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="app:flex app:flex-col app:gap-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          try {
            await beforeExport();
            const response = await fetch(`/api/files/${file.id}/export?format=${format}`);
            if (!response.ok) {
              const body = await response.json().catch(() => ({}));
              throw new Error(body.error?.message ?? 'Export failed.');
            }
            const blob = await response.blob(),
              url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${file.name}.${format === 'native' ? 'univer.json' : file.type === 'doc' ? 'docx' : file.type === 'slide' ? 'pptx' : 'xlsx'}`;
            anchor.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            onClose();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Export failed.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field>
          Format
          <Select
            label="Export format"
            value={format}
            onValueChange={(value) => setFormat(value as FileExportFormat)}
            disabled={busy}
            options={[
              ...(file.type !== 'board' ? [{ value: 'office', label: office }] : []),
              { value: 'native', label: 'Univer JSON (.univer.json)' },
            ]}
          />
        </Field>
        <p className="app:m-0 app:text-xs app:leading-5 app:text-zinc-500">
          {format === 'native'
            ? 'Keeps native content, layouts and views for reimport. Sharing permissions and conversation history are excluded.'
            : file.type === 'base'
              ? 'Exports table data to Excel. Use Univer JSON to keep Base views and field settings.'
              : 'Downloads the current saved content. Use Univer JSON to keep application-specific features for reimport.'}
        </p>
        {error && (
          <p role="alert" className="app:m-0 app:text-red-700">
            {error}
          </p>
        )}
        <div className="app:flex app:justify-end app:gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            <Download size={15} />
            {busy ? 'Exporting…' : 'Download'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
