import { useEffect, useRef, useState } from 'react';
import type { OfficeFile, User } from '@univer-copilot/shared';
import type { EditorHandle } from './types.ts';

export function OfficeEditor({
  file,
  user,
  license,
  onReady,
  onStatus,
  onMembers,
  onHistoryOpen,
  onRestored,
  shared = false,
}: {
  file: OfficeFile;
  user: User;
  license: string;
  onReady(handle: EditorHandle | null): void;
  onStatus(status: string): void;
  onMembers(members: string[]): void;
  onHistoryOpen(open: boolean): void;
  onRestored(): void;
  shared?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null),
    [error, setError] = useState<string>();
  const callbacks = useRef({ onReady, onStatus, onMembers, onHistoryOpen, onRestored });
  callbacks.current = { onReady, onStatus, onMembers, onHistoryOpen, onRestored };
  useEffect(() => {
    const controller = new AbortController();
    let handle: EditorHandle | undefined;
    const host = document.createElement('div');
    host.className = 'univer-container';
    container.current!.append(host);
    setError(undefined);
    void import('./univer/mount.ts')
      .then(({ mountEditor }) =>
        mountEditor(
          host,
          file,
          user,
          license,
          (value) => callbacks.current.onStatus(value),
          (value) => callbacks.current.onMembers(value),
          controller.signal,
          (value) => callbacks.current.onHistoryOpen(value),
          () => callbacks.current.onRestored(),
          shared,
        ),
      )
      .then((result) => {
        handle = result;
        callbacks.current.onReady(result);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'The editor could not open.');
      });
    return () => {
      controller.abort();
      callbacks.current.onReady(null);
      queueMicrotask(() => {
        handle?.dispose();
        host.remove();
      });
    };
  }, [file.id, user.id, license, shared]);
  return (
    <section className="editor-pane" aria-label={file.name}>
      <div className="univer-container" ref={container} />
      {error && (
        <div className="editor-error" role="alert">
          <strong>Unable to open this file</strong>
          <p>{error}</p>
        </div>
      )}
    </section>
  );
}
