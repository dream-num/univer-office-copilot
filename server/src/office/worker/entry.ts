import { parentPort } from 'node:worker_threads';
import {
  IAuthzIoService,
  IMentionIOService,
  IUndoRedoService,
  LocaleType,
  LogLevel,
  Univer,
  UserManagerService,
} from '@univerjs/core';
import { FUniver } from '@univerjs/core/facade';
import { HTTPRequest, HTTPService } from '@univerjs/network';
import SheetsEnUS from '@univerjs/sheets/locale/en-US';
import FormulaEnUS from '@univerjs/engine-formula/locale/en-US';
import CollaborationEnUS from '@univerjs-pro/collaboration-client/locale/en-US';
import { UniverRenderEnginePlugin } from '@univerjs/engine-render';
import { UniverLicensePlugin } from '@univerjs-pro/license';
import { RevertRevisionMutation, UniverCollaborationPlugin } from '@univerjs-pro/collaboration';
import {
  CollaborationSessionService,
  SessionStatus,
  UniverCollaborationClientPlugin,
} from '@univerjs-pro/collaboration-client';
import { firstValueFrom, filter, timeout } from 'rxjs';
import {
  NodeCollaborationSocketService,
  UniverCollaborationClientNodePlugin,
} from '@univerjs-pro/collaboration-client-node';
import type { OfficeFile } from '@univer-copilot/shared';
import type { OfficeWorkerAction } from '../contracts.ts';
import { readAfterWrite } from '../products/actions.ts';
import { author, inspectUnit } from '../authoring/index.ts';
import { registerProductPlugins } from '../products/plugins.ts';
import '@univerjs/sheets/facade';
import '@univerjs/sheets-formula/facade';
import '@univerjs/engine-formula/facade';
import '@univerjs/docs/facade';
import '@univerjs-pro/engine-shape/facade';
import '@univerjs-pro/slides/facade';
import '@univerjs-pro/bases/facade';
import '@univerjs-pro/boards/facade';
import { prepareDocument } from '../authoring/documents.ts';

type Job = {
  id: string;
  file: OfficeFile;
  actorId: string;
  token: string;
  origin: string;
  action: OfficeWorkerAction;
  documentState?: unknown;
};
parentPort!.on('message', async (job: Job) => {
  // Local compiler validation precedes the process-global collaboration Facade extensions.
  let prepared;
  try {
    prepared = await prepareDocument(job.file, job.action, job.documentState);
    await import('../products/facades.ts');
    await import('@univerjs-pro/collaboration-client/facade');
  } catch (error) {
    parentPort!.postMessage({
      id: job.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Document compilation failed.',
    });
    return;
  }
  const univer = new Univer({
    locale: LocaleType.EN_US,
    locales: { [LocaleType.EN_US]: { ...SheetsEnUS, ...FormulaEnUS, ...CollaborationEnUS } },
    logLevel: LogLevel.SILENT,
    override: [
      [IAuthzIoService, null],
      [IMentionIOService, null],
      [IUndoRedoService, null],
    ],
  });
  let api: FUniver | undefined;
  try {
    univer.registerPlugin(UniverLicensePlugin, {
      license: process.env.UNIVER_CLIENT_LICENSE?.trim() || undefined,
    });
    univer.registerPlugin(UniverRenderEnginePlugin);
    registerProductPlugins(univer, job.file.type);
    const base = `${job.origin}/universer-api`;
    univer.registerPlugin(UniverCollaborationPlugin);
    // The 1.3.1 Node socket opens a raw URL. The endpoint requires a one-time
    // ticket, so obtain it at the adapter boundary, including on reconnect.
    class TicketSocketService extends NodeCollaborationSocketService {
      override async createSocket(rawUrl: string) {
        const response = await fetch(`${base}/user/session-ticket`, {
          headers: { Authorization: `Bearer ${job.token}` },
        });
        if (!response.ok) throw new Error('The Office session could not be authenticated.');
        const data = (await response.json()) as { ticket?: string; sessionTicket?: string };
        const ticket = data.sessionTicket ?? data.ticket;
        if (!ticket) throw new Error('The Office session ticket was missing.');
        const url = new URL(rawUrl);
        url.searchParams.set('sessionTicket', ticket);
        return super.createSocket(url.toString());
      }
    }
    univer.registerPlugin(UniverCollaborationClientPlugin, {
      socketService: TicketSocketService,
      customHeaders: { Authorization: `Bearer ${job.token}` },
      enableSingleActiveInstanceLock: false,
      sendChangesetTimeout: 100,
      authzUrl: `${base}/authz`,
      snapshotServerUrl: `${base}/snapshot`,
      collabSubmitChangesetUrl: `${base}/comb`,
      collabWebSocketUrl: `${job.origin.replace(/^http/, 'ws')}/universer-api/comb/connect`,
      wsSessionTicketUrl: `${base}/user/session-ticket`,
    });
    univer.registerPlugin(UniverCollaborationClientNodePlugin);
    univer
      .__getInjector()
      .get(HTTPService)
      .registerHTTPInterceptor({
        priority: 1000,
        interceptor(request, next) {
          const url = new URL(request.url, job.origin);
          if (url.origin !== job.origin || !url.pathname.startsWith('/universer-api/'))
            throw new Error('Unexpected Office network destination.');
          const normalized = new HTTPRequest(request.method, url.toString(), request.requestParams);
          if (!normalized.headers.has('Authorization'))
            normalized.headers.set('Authorization', `Bearer ${job.token}`);
          return next(normalized);
        },
      });
    univer
      .__getInjector()
      .get(UserManagerService)
      .setCurrentUser({ userID: job.actorId, name: 'Copilot', avatar: '' });
    api = FUniver.newAPI(univer);
    const collaboration = api.getCollaboration();
    const loaders = {
      sheet: () => collaboration.loadSheetAsync(job.file.unitId),
      doc: () => collaboration.loadDocAsync(job.file.unitId),
      slide: () => collaboration.loadSlideAsync(job.file.unitId),
      base: () => collaboration.loadBaseAsync(job.file.unitId),
      board: () => collaboration.loadBoardAsync(job.file.unitId),
    };
    if (!(await loaders[job.file.type]())) throw new Error('The shared file could not be loaded.');
    if (job.action.kind === 'restore') {
      const session = await univer
        .__getInjector()
        .get(CollaborationSessionService)
        .requireSession(job.file.unitId);
      // A loaded snapshot can precede the realtime JOIN; restore needs its live member identity.
      await firstValueFrom(
        session.sessionStatus$.pipe(
          filter((status) => status === SessionStatus.ONLINE),
          timeout(10000),
        ),
      );
      // Submit through this client's pending/ACK state, as the SDK history command does.
      if (
        !(await api.executeCommand(RevertRevisionMutation.id, {
          unitId: job.file.unitId,
          revision: job.action.revision,
        }))
      )
        throw new Error('The version restore was rejected.');
      await collaboration.flush(job.file.unitId, { timeout: 15000 });
      parentPort!.postMessage({
        id: job.id,
        ok: true,
        result: {
          summary: 'Restored an earlier version',
          revision: job.action.expectedRevision + 1,
        },
      });
      return;
    }
    // Collaboration ACKs and formula results are separate completion barriers.
    if (job.file.type === 'sheet') await api.getFormula().onCalculationResultApplied(15000);
    if (job.action.kind === 'read-snapshot') {
      const units = {
        sheet: api.getWorkbook(job.file.unitId),
        doc: api.getDocument(job.file.unitId),
        slide: api.getPresentation(job.file.unitId),
        base: api.getBase(job.file.unitId),
        board: api.getBoard(job.file.unitId),
      };
      const unit = units[job.file.type];
      if (!unit) throw new Error('The Unit could not be exported for verification.');
      parentPort!.postMessage({
        id: job.id,
        ok: true,
        result: { summary: 'Read UnitData', content: unit.save() },
      });
      return;
    }
    const result = await author(api, job.file, job.action, job.documentState, prepared);
    if (job.file.type === 'sheet') await api.getFormula().onCalculationResultApplied(15000);
    await collaboration.flush(job.file.unitId, { timeout: 15000 });
    const verified = ['script.write', 'facade.write', 'doc.markdown', 'doc.typst'].includes(
      job.action.kind,
    )
      ? {
          ...result,
          content: { result: result.content, readback: await inspectUnit(api, job.file) },
          checked: true,
        }
      : ['script.read', 'script.verify', 'facade.read', 'doc.markdown.read'].includes(
            job.action.kind,
          )
        ? result
        : readAfterWrite(api, job.file, job.action, result);
    if (job.action.kind === 'slide.compiled')
      verified.content = { compiler: result.content, readback: verified.content };
    parentPort!.postMessage({
      id: job.id,
      ok: true,
      result: verified,
    });
  } catch (error) {
    parentPort!.postMessage({
      id: job.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Office operation failed.',
    });
  } finally {
    univer.dispose();
  }
});
