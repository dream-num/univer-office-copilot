import {
  IImageIoService,
  LocaleType,
  LocaleService,
  UserManagerService,
  LifecycleService,
  LifecycleStages,
  type Univer,
} from '@univerjs/core';
import { FUniver } from '@univerjs/core/facade';
import { UniverCollaborationPlugin } from '@univerjs-pro/collaboration';
import { UniverCollaborationClientPlugin } from '@univerjs-pro/collaboration-client';
import { ILocalCacheService } from '@univerjs-pro/collaboration-client';
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from '@univerjs-pro/collaboration-client-ui';
import locale from '@univerjs-pro/collaboration-client/locale/en-US';
import uiLocale from '@univerjs-pro/collaboration-client-ui/locale/en-US';
import type { OfficeFile, User, FileType } from '@univer-copilot/shared';
import type { EditorHandle } from '../types.ts';
import type { HostConfig } from './common.ts';
import { createHistoryHost, historyOperations } from './history.ts';
import { HistoryRestoreService } from '@univerjs-pro/edit-history';
import { compareVersions } from './comparison.ts';
import '@univerjs-pro/collaboration-client/facade';
import '@univerjs-pro/collaboration-client-ui/lib/index.css';

const loaders = {
  sheet: () => import('./sheet.ts'),
  doc: () => import('./doc.ts'),
  slide: () => import('./slide.ts'),
  base: () => import('./base.ts'),
  board: () => import('./board.ts'),
};
const unitTypes: Record<FileType, number> = { doc: 1, sheet: 2, slide: 3, base: 5, board: 6 };
export async function mountEditor(
  container: HTMLElement,
  file: OfficeFile,
  user: User,
  license: string,
  onStatus: (status: string) => void,
  onMembers: (members: string[]) => void,
  signal: AbortSignal,
  onHistoryOpen: (open: boolean) => void,
  onRestored: () => void,
  shared = false,
): Promise<EditorHandle> {
  const product = await loaders[file.type]();
  signal.throwIfAborted();
  const base = `${location.origin}/universer-api`;
  const plugins: HostConfig['plugins'] = [
    UniverCollaborationPlugin,
    [
      UniverCollaborationClientPlugin,
      {
        socketService: BrowserCollaborationSocketService,
        sendChangesetTimeout: 200,
        enableSingleActiveInstanceLock: false,
        enableCollaboration: true,
        // Keep the SDK's inline image IO: images travel with the shared Unit.
        override: [[IImageIoService, null]],
        customHeaders: {
          ...(shared ? { 'x-copilot-shared': 'true' } : {}),
        },
        authzUrl: `${base}/authz`,
        snapshotServerUrl: `${base}/snapshot`,
        collabSubmitChangesetUrl: `${base}/comb`,
        collabWebSocketUrl: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/universer-api/comb/connect`,
        wsSessionTicketUrl: `${base}/user/session-ticket`,
      },
    ],
    UniverCollaborationClientUIPlugin,
  ];
  const host: { univer: Univer; disposeWorker?: () => void } = await product.createHost({
    container,
    license,
    plugins,
  });
  const univer = host.univer;
  let api: FUniver | undefined;
  let historyHost: ReturnType<typeof createHistoryHost> | undefined;
  const disposables: { dispose(): void }[] = [];
  const dispose = () => {
    for (const d of disposables) d.dispose();
    api?.dispose();
    univer.dispose();
    host.disposeWorker?.();
    historyHost?.dispose();
  };
  try {
    signal.throwIfAborted();
    univer
      .__getInjector()
      .get(LocaleService)
      .load({ [LocaleType.EN_US]: { ...locale, ...uiLocale } });
    univer
      .__getInjector()
      .get(UserManagerService)
      .setCurrentUser({ userID: user.id, name: user.name, avatar: '' });
    historyHost = createHistoryHost(univer, container, onHistoryOpen);
    product.registerHistory(
      univer,
      historyHost.containerId,
      `${base}/history`,
      async (revision) => {
        // SDK 1.3.1 replays the last Doc state event when a Unit is reloaded in-place.
        // Keep the native viewer/confirmation, commit through its host client, then recreate the host.
        if (
          !(await univer
            .__getInjector()
            .get(HistoryRestoreService)
            .restore(file.unitId, unitTypes[file.type], revision))
        )
          throw new Error('The version restore was rejected.');
        await api!.getCollaboration().flush(file.unitId, { timeout: 15000 });
        onRestored();
      },
    );
    api = FUniver.newAPI(univer);
    const collab = api.getCollaboration();
    disposables.push(
      api.addEvent(api.Event.CollaborationStatusChanged, (event) => {
        if (event.unitId === file.unitId) onStatus(event.status);
      }),
    );
    disposables.push(
      collab.subscribeCollaborators(file.unitId, (members) =>
        onMembers(members.map((m) => m.name ?? 'Collaborator')),
      ),
    );
    await api.loadServerUnit(file.unitId, unitTypes[file.type]);
    // Sync can finish before the workbench mounts its canvas and takes initial focus.
    await univer.__getInjector().get(LifecycleService).onStage(LifecycleStages.Rendered);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    signal.throwIfAborted();
    onStatus(collab.getCollaborationStatus(file.unitId));
    return {
      compareVersions: (before, after) => compareVersions(univer, api!, file, before, after),
      flush: async () => {
        await collab.flush(file.unitId, { timeout: 15000 });
        await univer.__getInjector().get(ILocalCacheService).exhaustSavingTask();
      },
      async openHistory() {
        // Sheets registers its history operation during the SDK's deferred Steady stage.
        await univer.__getInjector().get(LifecycleService).onStage(LifecycleStages.Steady);
        signal.throwIfAborted();
        await collab.flush(file.unitId, { timeout: 15000 });
        // Finish deferred cache persistence before entering the read-only viewer.
        const cache = univer.__getInjector().get(ILocalCacheService);
        await cache.exhaustSavingTask();
        if (!(await api!.executeCommand(historyOperations[file.type])))
          throw new Error('File history could not open. Try again after the file has synced.');
        await historyHost!.waitForOpen();
      },
      dispose,
      selection() {
        if (file.type !== 'sheet') return null;
        const sheet = api!.getActiveWorkbook()?.getActiveSheet(),
          range = sheet?.getSelection()?.getActiveRange();
        return range && sheet
          ? {
              fileId: file.id,
              type: file.type,
              sheetId: sheet.getSheetId(),
              range: range.getA1Notation(),
              label: `${sheet.getSheetName()}!${range.getA1Notation()}`,
            }
          : null;
      },
      locate(value) {
        if (file.type === 'sheet' && value.range) {
          const workbook = api!.getActiveWorkbook(),
            sheet = value.sheetId
              ? workbook?.getSheetBySheetId(value.sheetId)
              : workbook?.getActiveSheet();
          if (sheet) {
            workbook!.setActiveSheet(sheet);
            sheet.getRange(value.range).activate();
          }
        }
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
