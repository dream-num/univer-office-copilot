import { randomBytes, randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type { IncomingMessage, Server } from 'node:http';
import type { RequestHandler } from 'express';
import { ErrorCode } from '@univerjs/protocol';
import { SQLiteDatabaseAdapter } from '@univerjs-pro/collaboration-database-sqlite';
import {
  CollabError,
  UniverCollabService,
  UnitSnapshotMaterializer,
  type ChangesetCommittedEvent,
} from '@univerjs-pro/collaboration-service';
import { UniverCollabEndpoint } from '@univerjs-pro/collaboration-endpoint';
import { createNodeTransport } from '@univerjs-pro/collaboration-transport-node';
import { UniverHistoryService } from '@univerjs-pro/collaboration-history-service';
import { SQLiteHistoryDatabaseAdapter } from '@univerjs-pro/collaboration-history-database-sqlite';
import { UniverHistoryEndpoint } from '@univerjs-pro/collaboration-history-endpoint';
import {
  RevertRevisionMutation,
  transformSnapshotToWorkbookData,
  transformSnapshotToDocumentData,
  transformSnapshotToSlideData,
  transformSnapshotToBaseData,
  transformSnapshotToBoardData,
} from '@univerjs-pro/collaboration';
import { UnitAction } from '@univerjs/protocol';
import { join } from 'node:path';
import type { FileVersion, OfficeFile, User } from '@univer-copilot/shared';
import { isReadAction } from '@univer-copilot/shared';
import { AppError } from '../http/errors.ts';
import type { OfficeGateway, OfficeResult, OfficeCommit, OfficeWorkerAction } from './contracts.ts';
import { emptyUnit, unitTypes } from './products/snapshots.ts';
import { createViewerReads } from './viewer-reads.ts';
import { createOfficeVisuals } from './visuals.ts';
import { createDocumentStateStore } from './document-state.ts';
import {
  importOfficeFile,
  nativeOfficeFile,
  exportOfficeBuffer,
  rebaseUnitData,
} from './transfer.ts';
import { officeEnvironment } from './environment.ts';

type Access = 'read' | 'write' | 'history' | 'manage';
type Lease = {
  id: string;
  token: string;
  actorId: string;
  unitId: string;
  runId: string;
  operationId: string;
  expiresAt: number;
  cancelled: boolean;
  memberId?: string;
  restore?: { revision: number; expectedRevision: number };
  readOnly?: boolean;
};
export type OfficeDependencies = {
  dataDir: string;
  origin(): string;
  workerUrl: URL;
  authenticate(request: IncomingMessage): User | null;
  authorize(actor: string, unitId: string, access: Access): void;
  coordinateRestore(unitId: string, operation: () => Promise<void>): Promise<void>;
  userName(actor: string): string | undefined;
  onCommit(commit: OfficeCommit): void;
};

export function createOfficeModule(options: OfficeDependencies) {
  const database = new SQLiteDatabaseAdapter({
    filename: join(options.dataDir, 'collaboration.sqlite'),
  });
  const historyDatabase = new SQLiteHistoryDatabaseAdapter({
    filename: join(options.dataDir, 'history.sqlite'),
  });
  const service = new UniverCollabService({ dbAdapter: database });
  const history = new UniverHistoryService({
    collabService: service,
    dbAdapter: historyDatabase,
    userProvider: {
      async getUsers(ids) {
        return ids.map((id) => ({
          userID: id,
          name: options.userName(id) ?? 'Former collaborator',
          avatar: '',
          anonymous: false,
          canBindAnonymous: false,
          phone: '',
          email: '',
          createTimestamp: 0,
        }));
      },
    },
  });
  const materializer = new UnitSnapshotMaterializer();
  const viewerReads = createViewerReads(service, materializer, authorize);
  const endpoint = new UniverCollabEndpoint(viewerReads.service),
    transport = createNodeTransport({ maxRequestBodyBytes: 4 * 1024 * 1024 });
  const leases = new Map<string, Lease>();
  const tokens = new Map<string, Lease>();
  let queue: Promise<unknown> = Promise.resolve(),
    worker: Worker | undefined;
  function authorize(actor: string, unitId: string, access: Access) {
    try {
      options.authorize(actor, unitId, access);
    } catch {
      throw new CollabError('PERMISSION_DENIED', 'File access denied.');
    }
  }

  function assertLease(data: Record<string, unknown>, unitId: string) {
    if (typeof data.leaseId !== 'string') return;
    const lease = leases.get(data.leaseId);
    if (!lease || lease.cancelled || lease.expiresAt < Date.now() || lease.unitId !== unitId)
      throw new CollabError('PERMISSION_DENIED', 'This Office operation is no longer authorized.');
  }
  function allowed(actor: string, unitId: string, action: number) {
    if (action < 0 || !Object.values(UnitAction).includes(action)) return false;
    const access: Access = [
      UnitAction.Share,
      UnitAction.ManageCollaborator,
      UnitAction.Delete,
      UnitAction.RecoverHistory,
      UnitAction.CreatePermissionObject,
    ].includes(action)
      ? 'manage'
      : [UnitAction.ViewHistory, UnitAction.IHistory].includes(action)
        ? 'history'
        : [
              UnitAction.View,
              UnitAction.Copy,
              UnitAction.Print,
              UnitAction.Export,
              UnitAction.SelectProtectedCells,
              UnitAction.SelectUnProtectedCells,
              UnitAction.ViemRwHgtClWdt,
              UnitAction.ViewFilter,
            ].includes(action)
          ? 'read'
          : 'write';
    try {
      authorize(actor, unitId, access);
      return true;
    } catch {
      return false;
    }
  }
  service.use('readUnitData', async (ctx, next) => {
    assertLease(ctx.customData, ctx.request.unitID);
    const historical = 'revision' in ctx.request && ctx.request.revision > 0;
    authorize(ctx.userID, ctx.request.unitID, historical ? 'history' : 'read');
    await next();
  });
  service.use('createUnit', async (ctx, next) => {
    if (ctx.customData.applicationCreate !== true)
      throw new CollabError('PERMISSION_DENIED', 'Create files through the application.');
    await next();
  });
  for (const action of ['deleteUnits', 'recoverUnits'] as const)
    service.use(action, async () => {
      throw new CollabError('PERMISSION_DENIED', 'Use the application recycle bin.');
    });
  service.use('submitChangeset', async (ctx, next) => {
    if (ctx.customData.readOnly)
      throw new CollabError('PERMISSION_DENIED', 'This Office session is read-only.');
    const cs = ctx.request.changeset;
    assertLease(ctx.customData, cs.unitID);
    authorize(ctx.userID, cs.unitID, 'write');
    const reverting = cs.mutations.some((m) => m.id === RevertRevisionMutation.id);
    if (reverting) authorize(ctx.userID, cs.unitID, 'manage');
    const lease =
      typeof ctx.customData.leaseId === 'string' ? leases.get(ctx.customData.leaseId) : undefined;
    cs.additionalFields = reverting
      ? undefined
      : lease
        ? JSON.stringify({ source: 'ai', runId: lease.runId, operationId: lease.operationId })
        : undefined;
    if (reverting && ctx.customData.applicationRestore !== true) {
      // The native history viewer submits through its own client and receives its own ACK.
      // Reserve the Unit before entering the SDK's commit lock, so cancellation can finish.
      if (lease)
        throw new CollabError('PERMISSION_DENIED', 'This operation cannot restore history.');
      await options.coordinateRestore(cs.unitID, async () => {
        ctx.customData.applicationRestore = true;
        ctx.customData.expectedRevision = cs.baseRev;
        await next();
      });
    } else await next();
  });
  service.use('commitChangeset', async (ctx, next) => {
    if (ctx.customData.readOnly)
      throw new CollabError('PERMISSION_DENIED', 'This Office session is read-only.');
    assertLease(ctx.customData, ctx.changeset.unitID);
    authorize(
      ctx.userID,
      ctx.changeset.unitID,
      ctx.customData.applicationRestore ? 'manage' : 'write',
    );
    for (const permission of ctx.requiredUnitPermissions)
      if (!allowed(ctx.userID, permission.unitID, permission.action))
        throw new CollabError(
          'PERMISSION_DENIED',
          'This edit requires a permission you do not have.',
        );
    if (
      ctx.customData.applicationRestore &&
      ctx.expectedHeadRevision !== ctx.customData.expectedRevision
    )
      throw new CollabError(
        'REVISION_MISMATCH',
        'The file changed. Preview it again before restoring.',
      );
    await next();
  });
  for (const action of ['getHistoryList', 'listHistoryCreators', 'getHistoryChangesets'] as const)
    history.use(
      action,
      async (ctx: { userID: string; request: { unitID: string } }, next: () => Promise<void>) => {
        authorize(ctx.userID, ctx.request.unitID, 'history');
        await next();
      },
    );
  service.on('changesetCommitted', async (event: ChangesetCommittedEvent) => {
    const cs = event.changeset;
    const restore = cs.mutations.find((m) => m.id === RevertRevisionMutation.id);
    if (restore && cs.type === 1) {
      const target = JSON.parse(restore.data) as { revision: number };
      // Both the native viewer and API restores keep authoring maps aligned with content.
      await documentStates.restore(cs.unitID, target.revision, cs.revision);
    }
    let meta: { runId?: string; operationId?: string } = {};
    try {
      meta = JSON.parse(cs.additionalFields ?? '{}') as typeof meta;
    } catch {
      /* A historical SDK field may not be JSON. */
    }
    options.onCommit({
      unitId: cs.unitID,
      actorId: event.userID,
      revision: cs.revision,
      changesetId: `${cs.unitID}:${cs.revision}`,
      ...meta,
    });
  });
  transport.use(async (ctx, next) => {
    const origin = ctx.incomingMessage.headers.origin;
    if (origin && new URL(origin).host !== ctx.incomingMessage.headers.host) {
      ctx.response.writeHead(403);
      ctx.response.end('Origin rejected');
      return;
    }
    const token = ctx.incomingMessage.headers.authorization?.replace(/^Bearer /, ''),
      lease = token ? tokens.get(token) : undefined;
    const user =
      lease && !lease.cancelled && lease.expiresAt > Date.now()
        ? { id: lease.actorId, name: 'Copilot', email: '' }
        : options.authenticate(ctx.incomingMessage);
    if (!user) {
      ctx.response.writeHead(401);
      ctx.response.end('Sign in first');
      return;
    }
    ctx.userID = user.id;
    ctx.customData.displayName = user.name;
    if (ctx.incomingMessage.headers['x-copilot-preview'] === 'true') ctx.customData.readOnly = true;
    if (lease?.readOnly) ctx.customData.readOnly = true;
    if (lease) {
      ctx.customData.leaseId = lease.id;
      if (lease.restore) {
        ctx.customData.applicationRestore = true;
        ctx.customData.expectedRevision = lease.restore.expectedRevision;
      }
    }
    await next();
  });
  transport.useUpgrade(async (ctx, next) => {
    const origin = ctx.incomingMessage.headers.origin;
    if (origin && new URL(origin).host !== ctx.incomingMessage.headers.host) {
      ctx.reject(403, 'Origin rejected');
      return;
    }
    await next();
  });
  endpoint.use('connect', async (ctx, next) => {
    ctx.member.name = String(ctx.session.customData.displayName ?? 'Collaborator');
    const lease = leases.get(String(ctx.session.customData.leaseId ?? ''));
    if (lease) lease.memberId = ctx.member.memberID;
    await next();
  });
  endpoint.use('joinUnit', async (ctx, next) => {
    assertLease(ctx.session.customData, ctx.unitID);
    authorize(ctx.session.userID, ctx.unitID, 'read');
    await next();
  });
  transport.register(endpoint);
  transport.register(new UniverHistoryEndpoint(history));

  function getWorker() {
    return (worker ??= new Worker(options.workerUrl, {
      env: officeEnvironment(),
      execArgv: options.workerUrl.pathname.endsWith('.ts') ? ['--import', 'tsx'] : [],
    }));
  }
  async function revision(file: OfficeFile, actor: string) {
    authorize(actor, file.unitId, 'read');
    return (
      await service.getUnitLoadData(
        { unitID: file.unitId, type: unitTypes[file.type], revision: 0 },
        { userID: actor },
      )
    ).targetRevision;
  }
  function executeWorker(
    file: OfficeFile,
    actorId: string,
    runId: string,
    operationId: string,
    action: OfficeWorkerAction,
    signal: AbortSignal,
  ): Promise<OfficeResult> {
    const run = async () => {
      signal.throwIfAborted();
      authorize(
        actorId,
        file.unitId,
        action.kind === 'restore'
          ? 'manage'
          : isReadAction(action) || action.kind === 'read-snapshot'
            ? 'read'
            : 'write',
      );
      const lease: Lease = {
        id: randomUUID(),
        token: randomBytes(32).toString('base64url'),
        unitId: file.unitId,
        actorId,
        runId,
        operationId,
        expiresAt: Date.now() + 60000,
        cancelled: false,
        readOnly: isReadAction(action) || action.kind === 'read-snapshot',
        ...(action.kind === 'restore'
          ? { restore: { revision: action.revision, expectedRevision: action.expectedRevision } }
          : {}),
      };
      leases.set(lease.id, lease);
      tokens.set(lease.token, lease);
      let abortJob = () => {};
      const cancel = () => {
        lease.cancelled = true;
        abortJob();
      };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        const documentState = ['doc.markdown', 'doc.markdown.read', 'doc.typst'].includes(
          action.kind,
        )
          ? await documentStates.read(file.unitId)
          : undefined;
        const result = await new Promise<OfficeResult>((resolve, reject) => {
          const target = getWorker(),
            id = randomUUID();
          const cleanup = () => {
            clearTimeout(timer);
            target.off('message', message);
            // Retain the error listener until termination, including after a confirmed ACK.
          };
          abortJob = () => {
            cleanup();
            reject(signal.reason ?? new DOMException('Office operation cancelled.', 'AbortError'));
          };
          const error = (cause: Error) => {
            cleanup();
            reject(
              new AppError(
                503,
                'OFFICE_WORKER_FAILED',
                'The Office worker stopped. Confirmed edits remain saved.',
                { cause },
              ),
            );
          };
          const message = async (value: {
            id: string;
            ok: boolean;
            result: OfficeResult;
            error: string;
          }) => {
            if (value.id !== id) return;
            cleanup();
            value.ok
              ? resolve(value.result)
              : reject(new AppError(422, 'OFFICE_OPERATION_FAILED', value.error));
          };
          const timer = setTimeout(() => {
            lease.cancelled = true;
            cleanup();
            void target.terminate();
            worker = undefined;
            reject(
              new AppError(
                504,
                'OFFICE_TIMEOUT',
                'The Office operation timed out. Check its confirmed modification record before retrying.',
              ),
            );
          }, 45000);
          target.on('message', message);
          target.once('error', error);
          target.postMessage({
            id,
            file,
            actorId,
            token: lease.token,
            action,
            origin: options.origin(),
            documentState,
          });
        });
        // Keep mappings ordered with native writes/restores inside the same worker queue.
        if (result.documentState !== undefined) {
          await documentStates.save(
            file.unitId,
            await revision(file, actorId),
            result.documentState,
          );
          delete result.documentState;
        }
        return result;
      } finally {
        signal.removeEventListener('abort', cancel);
        if (lease.memberId)
          await endpoint.evictSessions({ unitID: file.unitId, memberID: lease.memberId });
        await worker?.terminate();
        worker = undefined;
        leases.delete(lease.id);
        tokens.delete(lease.token);
      }
    };
    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
  }
  const gateway: OfficeGateway = {
    revision,
    async create(file, actorId, initial) {
      const data = initial
        ? ({
            type: unitTypes[file.type],
            data: {
              ...rebaseUnitData(initial.data, file.unitId),
              id: file.unitId,
              rev: 1,
              name: file.name,
              ...(file.type === 'doc' ? { title: file.name } : {}),
            },
          } as ReturnType<typeof emptyUnit>)
        : emptyUnit(file);
      try {
        await service.createUnitFromData(data, {
          userID: actorId,
          customData: { applicationCreate: true },
        });
      } catch (error) {
        if (initial && error instanceof CollabError && error.code === 'INVALID_REQUEST')
          throw new AppError(
            422,
            'INVALID_SNAPSHOT',
            'This file contains invalid native Office content.',
          );
        throw error;
      }
      if (file.type === 'doc' && initial?.documentState !== undefined)
        await documentStates.save(file.unitId, 1, initial.documentState);
    },
    async inspect(file, actorId) {
      return {
        fileId: file.id,
        unitId: file.unitId,
        type: file.type,
        name: file.name,
        ...(file.type === 'doc' ? { documentFlavor: file.documentFlavor ?? 'modern' } : {}),
        revision: await revision(file, actorId),
      };
    },
    async execute(file, actor, runId, operationId, action, signal) {
      if (action.kind === 'slide.svg') {
        authorize(actor, file.unitId, 'write');
        signal.throwIfAborted();
        const compiled = await visuals.compile(action);
        signal.throwIfAborted();
        return executeWorker(file, actor, runId, operationId, compiled, signal);
      }
      return executeWorker(file, actor, runId, operationId, action, signal);
    },
    api: (input) => visuals.api(input),
    resources: (input) => visuals.resources(input),
    async visual(file, actor, target) {
      authorize(actor, file.unitId, 'read');
      return visuals.visual(file, actor, target);
    },
    readImage: (unitId, imageId) => visuals.readImage(unitId, imageId),
    async snapshot(file, actorId) {
      const result = await executeWorker(
        file,
        actorId,
        '',
        randomUUID(),
        { kind: 'read-snapshot' },
        AbortSignal.timeout(40000),
      );
      return result.content as Record<string, unknown>;
    },
    async versions(file, actorId) {
      const result = await history.getHistoryList(
        { unitID: file.unitId, length: 100 },
        { userID: actorId },
      );
      return result.historyIds.map((id) => {
        const data = result.entities.datas[id]!;
        let meta: { source?: string; runId?: string } = {};
        try {
          meta = JSON.parse(data.additionalFields ?? '{}') as typeof meta;
        } catch {
          /* Preserve compatibility with opaque SDK metadata. */
        }
        const timestamp = Number(data.createTime);
        const restored =
          meta.source === 'restore' || data.command.includes(RevertRevisionMutation.id);
        return {
          id,
          revision: data.endRevision,
          at: timestamp < 1e12 ? timestamp * 1000 : timestamp,
          actor: result.entities.users[data.userID]?.name ?? data.userID,
          actorId: data.userID,
          source: restored ? 'restore' : meta.runId ? 'ai' : 'user',
          summary: restored
            ? 'Restored an earlier version'
            : meta.runId
              ? 'Copilot edit'
              : 'Manual edit',
        } satisfies FileVersion;
      });
    },
    async preview(file, actorId, rev) {
      authorize(actorId, file.unitId, 'history');
      const data = await service.getUnitLoadDataWithBlocks(
        { unitID: file.unitId, type: unitTypes[file.type], revision: rev },
        { userID: actorId },
      );
      if (data.targetRevision !== rev)
        throw new AppError(404, 'VERSION_NOT_FOUND', 'This file version is unavailable.');
      const { snapshot, sheetBlocks } = await materializer.materializeSnapshot(data);
      const convert = {
        sheet: () => transformSnapshotToWorkbookData(snapshot, sheetBlocks),
        doc: () => transformSnapshotToDocumentData(snapshot),
        slide: () => transformSnapshotToSlideData(snapshot),
        base: () => transformSnapshotToBaseData(snapshot, sheetBlocks),
        board: () => transformSnapshotToBoardData(snapshot),
      };
      return {
        unitId: file.unitId,
        type: file.type,
        revision: data.targetRevision,
        data: await convert[file.type](),
      };
    },
    async restore(file, actorId, rev, expectedRevision) {
      authorize(actorId, file.unitId, 'manage');
      const target = await service.getUnitLoadData(
        { unitID: file.unitId, type: unitTypes[file.type], revision: rev },
        { userID: actorId },
      );
      if (target.targetRevision !== rev)
        throw new AppError(404, 'VERSION_NOT_FOUND', 'This file version is unavailable.');
      if ((await revision(file, actorId)) !== expectedRevision)
        throw new AppError(
          409,
          'REVISION_CHANGED',
          'The file changed. Preview its current state before restoring.',
        );
      const result = await executeWorker(
        file,
        actorId,
        '',
        randomUUID(),
        { kind: 'restore', revision: rev, expectedRevision },
        AbortSignal.timeout(40000),
      );
      return result.revision!;
    },
    import: importOfficeFile,
    async export(file, actorId, format = 'office') {
      if (format === 'native' || file.type === 'board')
        return {
          bytes: nativeOfficeFile(
            file,
            await gateway.snapshot(file, actorId),
            file.type === 'doc' ? await documentStates.read(file.unitId) : undefined,
          ),
          contentType: 'application/json',
          extension: 'univer.json',
        };
      const data = await service.getUnitLoadDataWithBlocks(
        { unitID: file.unitId, type: unitTypes[file.type], revision: 0 },
        { userID: actorId },
      );
      return exportOfficeBuffer(await materializer.materializeSnapshot(data), file.type);
    },
    async close() {
      await visuals.close();
      await queue;
      await worker?.terminate();
      await transport.dispose();
      await history.dispose();
      await materializer.dispose();
      await service.dispose();
      await historyDatabase.dispose();
      await database.dispose();
    },
  };
  const documentStates = createDocumentStateStore(options.dataDir);
  const visuals = createOfficeVisuals(options.dataDir, (file, actor) =>
    gateway.snapshot(file, actor),
  );
  return {
    gateway,
    attach(server: Server) {
      transport.attach(server);
    },
    invalidate(unitId: string) {
      viewerReads.invalidate(unitId);
      return endpoint.invalidateUnitSessions({ unitID: unitId });
    },
    allowed,
    authzHandler: ((req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      const token = req.headers.authorization?.replace(/^Bearer /, ''),
        lease = token ? tokens.get(token) : undefined;
      const actor =
        lease && !lease.cancelled && lease.expiresAt > Date.now()
          ? lease.actorId
          : options.authenticate(req)?.id;
      if (!actor) {
        res.status(401).end();
        return;
      }
      const requests = req.body?.requests as {
        unitID: string;
        objectID: string;
        actions: number[];
      }[];
      if (
        !Array.isArray(requests) ||
        requests.length > 1000 ||
        requests.some(
          (r) =>
            typeof r.unitID !== 'string' ||
            !Array.isArray(r.actions) ||
            r.actions.length > 100 ||
            r.actions.some((a) => !Number.isInteger(a)),
        )
      ) {
        res.status(400).end();
        return;
      }
      const preview = req.headers['x-copilot-preview'] === 'true' || !!lease?.readOnly;
      res.json({
        error: { code: ErrorCode.OK, message: '' },
        objectActions: requests.map((r) => ({
          unitID: r.unitID,
          objectID: r.objectID,
          actions: r.actions.map((action) => ({
            action,
            allowed:
              (!preview ||
                [UnitAction.View, UnitAction.Copy, UnitAction.ViewHistory].includes(action)) &&
              allowed(actor, r.unitID, action),
          })),
        })),
      });
    }) satisfies RequestHandler,
    workerActor(request: IncomingMessage) {
      const token = request.headers.authorization?.replace(/^Bearer /, '');
      const lease = token ? tokens.get(token) : undefined;
      return lease && !lease.cancelled && lease.expiresAt > Date.now() ? lease.actorId : null;
    },
  };
}
