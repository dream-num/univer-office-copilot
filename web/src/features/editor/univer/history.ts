import { LocaleService, LocaleType, type Univer } from '@univerjs/core';
import { UniverEditHistoryPlugin } from '@univerjs-pro/edit-history';
import HistoryEnUS from '@univerjs-pro/edit-history-ui/locale/en-US';
import type { FileType } from '@univer-copilot/shared';
import '@univerjs-pro/edit-history-ui/lib/index.css';

// Public registered operations; the product UI owns its viewer, preview and restore flow.
export const historyOperations: Record<FileType, string> = {
  sheet: 'univer.operation.toggle-edit-history',
  doc: 'docs-history-ui.operation.open',
  slide: 'slides-history-ui.operation.open',
  base: 'bases-history-ui.operation.open',
  board: 'boards-history-ui.operation.open',
};

export function createHistoryHost(
  univer: Univer,
  editorContainer: HTMLElement,
  onOpen: (open: boolean) => void,
) {
  const root = document.createElement('div');
  root.id = `office-history-${crypto.randomUUID()}`;
  root.className = 'office-history-host';
  root.dataset.open = 'false';
  root.setAttribute('aria-label', 'File history');
  root.setAttribute('role', 'region');
  editorContainer.parentElement!.append(root);
  let open = false;
  let opened: (() => void) | undefined;
  let cancelled: (() => void) | undefined;
  // Observe only the application-owned mount point, without reaching into SDK services.
  const observer = new MutationObserver(() => {
    const visible = [...root.children].some(
      (child) => child instanceof HTMLElement && child.style.display !== 'none',
    );
    if (visible !== open) {
      open = visible;
      root.dataset.open = String(open);
      editorContainer.inert = open;
      onOpen(open);
      if (open) opened?.();
    }
  });
  observer.observe(root, {
    childList: true,
    attributes: true,
    attributeFilter: ['style'],
    subtree: true,
  });
  univer.registerPlugin(UniverEditHistoryPlugin, {
    historyServerUrl: `${location.origin}/universer-api/history`,
  });
  univer
    .__getInjector()
    .get(LocaleService)
    .load({
      [LocaleType.EN_US]: {
        ...HistoryEnUS,
        'edit-history-ui': {
          ...HistoryEnUS['edit-history-ui'],
          restoreConfirmText:
            'Restore the whole shared file to this version? Later edits stay in history. Active Copilot work will stop.',
        },
      },
    });
  return {
    containerId: root.id,
    waitForOpen() {
      if (open) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          clearTimeout(timer);
          opened = cancelled = undefined;
          if (error) reject(error);
          else resolve();
        };
        const timer = setTimeout(
          () =>
            finish(new Error('File history could not open. Check your connection and try again.')),
          15000,
        );
        opened = () => finish();
        cancelled = () => finish(new DOMException('Editor closed.', 'AbortError'));
      });
    },
    dispose() {
      cancelled?.();
      observer.disconnect();
      root.remove();
      editorContainer.inert = false;
      onOpen(false);
    },
  };
}
