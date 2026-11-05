import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, History, LoaderCircle, MapPin, RotateCcw } from 'lucide-react';
import type { FileVersion, OfficeFile, RunChange } from '@univer-copilot/shared';
import { api, post } from '../../api/client.ts';
import { Button } from '../../components/button.tsx';
import { ConfirmDialog } from '../../components/confirm-dialog.tsx';
import { Dialog } from '../../components/dialog.tsx';
import { Tooltip } from '../../components/tooltip.tsx';
import type {
  EditorHandle,
  PreparedVersionComparison,
  VersionComparisonPage,
  VersionSnapshot,
} from '../editor/index.ts';

function ChangeDetails({
  file,
  revision,
  compare,
}: {
  file: OfficeFile;
  revision: number;
  compare: EditorHandle['compareVersions'];
}) {
  const [page, setPage] = useState<VersionComparisonPage>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const prepared = useRef<PreparedVersionComparison | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setPage(undefined);
    prepared.current = null;
    void Promise.all(
      [Math.max(1, revision - 1), revision].map(
        async (value) =>
          (
            await api<{ content: VersionSnapshot }>(`/files/${file.id}/versions/${value}`, {
              signal: controller.signal,
            })
          ).content,
      ),
    )
      .then(([before, after]) => {
        if (controller.signal.aborted) return;
        prepared.current = compare(before!, after!);
        setPage(prepared.current.query());
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Changes could not load.');
      });
    return () => controller.abort();
  }, [file.id, revision, attempt]);
  if (error)
    return (
      <div role="alert" className="app:space-y-2 app:p-4">
        <p>{error}</p>
        <Button size="sm" variant="secondary" onClick={() => setAttempt(attempt + 1)}>
          Try again
        </Button>
      </div>
    );
  if (!page)
    return (
      <div role="status" className="app:flex app:items-center app:gap-2 app:p-4 app:text-zinc-500">
        <LoaderCircle size={14} className="app:animate-spin app:motion-reduce:animate-none" />
        Loading changes…
      </div>
    );
  return (
    <div className="app:space-y-3 app:border-0 app:border-t app:border-solid app:border-zinc-200 app:p-4">
      {page.approximate && (
        <p className="app:text-xs app:text-zinc-500">
          Some structural changes use snapshot positions. Open file history for the full visual
          comparison.
        </p>
      )}
      <p className="app:m-0 app:text-xs app:text-zinc-500">
        {page.total === 0
          ? 'No content differences in this revision.'
          : `${page.total} ${page.total === 1 ? 'change' : 'changes'}`}
      </p>
      {page.items.map((item) => (
        <section key={item.id} className="app:space-y-2">
          <div className="app:flex app:items-center app:justify-between app:gap-3 app:text-xs">
            <strong className="app:font-medium app:text-zinc-700">{item.label}</strong>
            <span className="app:text-zinc-500">
              {{ insert: 'Added', delete: 'Removed', update: 'Updated' }[item.kind]}
            </span>
          </div>
          {item.details.map((detail, index) => (
            <div
              key={index}
              className="app:overflow-hidden app:rounded-lg app:border app:border-solid app:border-zinc-200"
            >
              <div className="app:bg-zinc-50 app:px-3 app:py-1.5 app:text-xs app:text-zinc-500">
                {detail.field}
              </div>
              <div className="app:grid app:grid-cols-1 app:sm:grid-cols-2">
                {(['before', 'after'] as const).map((side) => (
                  <div
                    key={side}
                    className="app:min-w-0 app:border-0 app:p-3 app:last:border-t app:last:border-solid app:last:border-zinc-200 app:sm:last:border-t-0 app:sm:last:border-l"
                  >
                    <div className="app:mb-1.5 app:text-[11px] app:font-medium app:text-zinc-400">
                      {side === 'before' ? 'Before' : 'After'}
                    </div>
                    <pre className="app:m-0 app:max-h-48 app:overflow-auto app:font-sans app:text-xs app:leading-5 app:whitespace-pre-wrap app:[overflow-wrap:anywhere]">
                      {detail[side]}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {item.details.length === 0 && (
            <p className="app:m-0 app:text-xs app:text-zinc-500">
              {item.kind === 'delete'
                ? 'This item was removed.'
                : item.kind === 'insert'
                  ? 'This item was added.'
                  : 'This item changed position.'}
            </p>
          )}
        </section>
      ))}
      {page.hasMore && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const next = prepared.current!.query(page.items.length);
            setPage({ ...next, items: [...page.items, ...next.items] });
          }}
        >
          Show more changes
        </Button>
      )}
    </div>
  );
}

export function TurnChanges({
  file,
  changes,
  running,
  historyOpen,
  flush,
  compare,
  onClose,
  onHistory,
  onRestored,
  onLocate,
}: {
  file: OfficeFile;
  changes: RunChange[];
  running: boolean;
  historyOpen: boolean;
  flush(): Promise<void>;
  compare: EditorHandle['compareVersions'];
  onClose(): void;
  onHistory(): void;
  onRestored(): void;
  onLocate: EditorHandle['locate'];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restore, setRestore] = useState<{
    revision: number;
    expectedRevision: number;
    operationId: string;
  } | null>(null);
  const [restored, setRestored] = useState<number | null>(null);
  const baseline = changes.length
    ? Math.max(1, Math.min(...changes.map((change) => change.revision)) - 1)
    : 1;
  async function prepareRestore(revision: number) {
    setBusy(true);
    setError('');
    try {
      await flush();
      const { versions } = await api<{ versions: FileVersion[] }>(`/files/${file.id}/versions`);
      const head = Math.max(...versions.map((version) => version.revision));
      if (!Number.isSafeInteger(head) || head < revision)
        throw new Error('The current version could not be checked. Try again.');
      setRestore({ revision, expectedRevision: head, operationId: crypto.randomUUID() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The restore could not be prepared.');
    } finally {
      setBusy(false);
    }
  }
  const canRestore = file.role === 'owner' && !running && !historyOpen && !busy;
  return (
    <>
      <Dialog
        open
        title="This turn’s modifications"
        wide
        onClose={() => {
          if (!busy) onClose();
        }}
        footer={
          changes.length > 0 && (
            <div className="app:flex app:flex-wrap app:items-center app:justify-between app:gap-3">
              {restored === null &&
              file.role === 'owner' &&
              changes.some((change) => change.revision > 1) ? (
                <Button
                  variant="secondary"
                  disabled={!canRestore}
                  onClick={() => void prepareRestore(baseline)}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Restore before this turn
                </Button>
              ) : (
                <span />
              )}
              <div className="app:flex app:flex-wrap app:gap-2">
                <Button
                  variant="ghost"
                  disabled={busy || historyOpen}
                  onClick={() => {
                    onClose();
                    onHistory();
                  }}
                >
                  <History size={14} aria-hidden="true" />
                  Open file history
                </Button>
                {restored !== null && <Button onClick={onClose}>Done</Button>}
              </div>
              {restored === null && (
                <p className="app:m-0 app:w-full app:text-xs app:text-zinc-500">
                  Restoring replaces the whole file, including later edits. All versions remain in
                  history.
                </p>
              )}
            </div>
          )
        }
      >
        {restored !== null ? (
          <div
            role="status"
            className="app:flex app:items-start app:gap-3 app:rounded-xl app:bg-zinc-50 app:p-4"
          >
            <Check size={18} className="app:mt-0.5 app:shrink-0" />
            <div>
              <strong className="app:block app:font-medium">File restored</strong>
              <p className="app:mt-1 app:mb-0 app:text-zinc-500">
                Restored to revision {restored}. Later versions remain in file history.
              </p>
            </div>
          </div>
        ) : changes.length === 0 ? (
          <p className="empty-list">No file changes were confirmed in this turn.</p>
        ) : (
          <div className="app:space-y-2">
            {changes.map((change) => (
              <div
                key={change.id}
                className="app:overflow-hidden app:rounded-xl app:border app:border-solid app:border-zinc-200"
              >
                <div className="app:flex app:items-center app:gap-2 app:p-2">
                  <Button
                    variant="ghost"
                    className="app:h-auto app:min-w-0 app:flex-1 app:justify-start app:gap-3 app:py-2 app:text-left app:whitespace-normal"
                    aria-label={`View changes in revision ${change.revision}`}
                    aria-expanded={expanded === change.id}
                    aria-controls={`change-${change.id}`}
                    onClick={() => setExpanded(expanded === change.id ? null : change.id)}
                  >
                    <ChevronDown
                      size={15}
                      className={`app:shrink-0 app:text-zinc-400 app:transition-transform ${expanded === change.id ? 'app:rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                    <span className="app:flex app:min-w-0 app:flex-wrap app:items-baseline app:gap-x-3 app:gap-y-0.5">
                      <span className="app:shrink-0 app:font-medium">
                        Revision {change.revision}
                      </span>
                      {!change.summary.endsWith(' through native Facade') && (
                        <span className="app:text-xs app:font-normal app:text-zinc-500">
                          {change.summary}
                        </span>
                      )}
                    </span>
                  </Button>
                  <Tooltip
                    content={change.checked ? 'Saved and verified' : 'Saved; verification pending'}
                  >
                    <span className="app:inline-flex app:shrink-0 app:text-zinc-400">
                      <Check
                        size={14}
                        aria-label={
                          change.checked ? 'Saved and verified' : 'Saved; verification pending'
                        }
                      />
                    </span>
                  </Tooltip>
                  {file.type === 'sheet' && change.location?.range && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Locate this edit"
                      tooltip="Locate this edit in the current file"
                      onClick={() => {
                        onClose();
                        onLocate(change.location!);
                      }}
                    >
                      <MapPin size={15} />
                    </Button>
                  )}
                  {file.role === 'owner' && change.revision > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Restore before revision ${change.revision}`}
                      tooltip="Restore the whole file to before this edit"
                      disabled={!canRestore}
                      onClick={() => void prepareRestore(change.revision - 1)}
                    >
                      <RotateCcw size={15} />
                    </Button>
                  )}
                </div>
                {expanded === change.id && (
                  <div id={`change-${change.id}`}>
                    <ChangeDetails file={file} revision={change.revision} compare={compare} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {busy && (
          <p role="status" className="app:text-xs app:text-zinc-500">
            Checking the current version…
          </p>
        )}
      </Dialog>
      <ConfirmDialog
        open={restore !== null}
        title="Restore file?"
        description={`Restore “${file.name}” to revision ${restore?.revision ?? baseline}? This replaces the whole file, including later edits. All versions remain in file history.`}
        confirmLabel="Restore file"
        onClose={() => setRestore(null)}
        onConfirm={async () => {
          if (!restore) return;
          setBusy(true);
          try {
            await post(`/files/${file.id}/restore`, restore);
            onRestored();
            setRestored(restore.revision);
            setExpanded(null);
            setRestore(null);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
