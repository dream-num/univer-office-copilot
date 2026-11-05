import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { openDatabase } from '../db/index.ts';
import { errorHandler } from '../http/errors.ts';
import { createAuthService } from '../modules/auth/index.ts';
import { createFilesModule, type FilesService } from '../modules/files/index.ts';
import { createConversationsModule } from '../modules/conversations/index.ts';
import { createProvidersModule, type ModelFactory } from '../modules/providers/index.ts';
import { createCopilotModule } from '../modules/copilot/index.ts';
import { createAttachmentsModule } from '../modules/attachments/index.ts';
import { createUnitCoordinator } from '../coordination/index.ts';
import { createOfficeModule } from '../office/gateway.ts';
import { seedDemoExamples } from './examples.ts';

export type ApplicationOptions = {
  host: string;
  port: number;
  demo: boolean;
  demoExamples?: boolean;
  dataDir: string;
  staticDir?: string;
  modelFactory?: ModelFactory;
};
export async function createApplication(options: ApplicationOptions) {
  const { host, port, demo } = options;
  if (demo && !['127.0.0.1', 'localhost', '::1'].includes(host))
    throw new Error('Demo mode is restricted to loopback. Disable it before exposing the server.');
  const dataDir = resolve(options.dataDir);
  await mkdir(dataDir, { recursive: true });
  const db = openDatabase(resolve(dataDir, 'application.sqlite')),
    auth = createAuthService(
      db,
      demo,
      options.demoExamples ? (user) => seedDemoExamples(files, user.id) : undefined,
    ),
    coordinator = createUnitCoordinator();
  let files!: FilesService;
  let copilot: ReturnType<typeof createCopilotModule> | undefined;
  const office = createOfficeModule({
    dataDir,
    origin: () => `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    workerUrl: new URL(
      import.meta.url.endsWith('.ts') ? '../office/worker/entry.ts' : './office-worker.js',
      import.meta.url,
    ),
    authenticate(req) {
      const user = auth.current(req.headers.cookie);
      if (user && req.headers['x-copilot-shared'] !== 'true') return user;
      const token = req.headers.cookie
        ?.split(';')
        .map((x) => x.trim())
        .find((x) => x.startsWith('copilot_share='))
        ?.slice(14);
      if (!token) return user;
      try {
        const result = files.shared(token);
        return { id: result.actorId, name: 'Guest viewer', email: '' };
      } catch {
        return null;
      }
    },
    authorize(actor, unitId, access) {
      files.byUnit(unitId, actor, access);
    },
    coordinateRestore: (unitId, operation) => coordinator.restore(unitId, operation),
    userName: (actor) => auth.findPublicUser(actor)?.name,
    onCommit(commit) {
      files.touch(commit.unitId);
      copilot?.service.recordCommit(commit);
    },
  });
  const fileModule = createFilesModule(db, auth, office.gateway, coordinator, office.invalidate);
  files = fileModule.service;
  const conversations = createConversationsModule(db, auth, files, (id, actor) =>
      copilot!.service.summaries(id, actor),
    ),
    providers = createProvidersModule(db, auth, options.modelFactory, demo);
  const attachments = createAttachmentsModule(
    db,
    auth,
    conversations.service,
    new URL(
      import.meta.url.endsWith('.ts')
        ? '../modules/attachments/worker.ts'
        : './attachment-worker.js',
      import.meta.url,
    ),
  );
  copilot = createCopilotModule(
    db,
    auth,
    files,
    conversations.service,
    providers.service,
    office.gateway,
    coordinator,
    attachments.service,
  );
  await files.recoverCreates();
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) {
      res
        .status(403)
        .json({ error: { code: 'ORIGIN_REJECTED', message: 'Request origin is not allowed.' } });
      return;
    }
    if (demo && !['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname)) {
      res.status(403).json({
        error: { code: 'DEMO_LOCAL_ONLY', message: 'Demo mode only accepts local hosts.' },
      });
      return;
    }
    next();
  });
  app.use(express.json({ limit: '256kb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/config', (_req, res) =>
    res.json({
      demo,
      sdkVersion: '1.3.1',
      clientLicense: process.env.UNIVER_CLIENT_LICENSE?.trim() ?? '',
    }),
  );
  app.get('/api/office/previews/:unitId/:imageId', async (req, res) => {
    const user = auth.requireUser(req);
    files.byUnit(req.params.unitId, user.id, 'read');
    res
      .type('image/png')
      .send(Buffer.from(await office.gateway.readImage(req.params.unitId, req.params.imageId)));
  });
  app.use(
    '/api',
    auth.router,
    fileModule.router,
    conversations.router,
    providers.router,
    attachments.router,
    copilot.router,
  );
  app.post('/universer-api/authz/-/object/-/batch_allowed', office.authzHandler);
  const webDir = options.staticDir ?? resolve('dist/web');
  if (existsSync(webDir)) {
    app.use(express.static(webDir));
    app.use((req, res, next) => {
      if (
        req.method === 'GET' &&
        !req.path.startsWith('/api/') &&
        !req.path.startsWith('/universer-api/')
      )
        res.sendFile(resolve(webDir, 'index.html'));
      else next();
    });
  }
  app.use(errorHandler);
  const server = createServer(app);
  office.attach(server);
  let closed = false;
  return {
    app,
    server,
    db,
    services: {
      auth,
      files,
      conversations: conversations.service,
      providers: providers.service,
      copilot: copilot.service,
      office: office.gateway,
      attachments: attachments.service,
    },
    async start() {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
      });
      return (server.address() as { port: number }).port;
    },
    async close() {
      if (closed) return;
      closed = true;
      await copilot!.service.stop();
      await attachments.close();
      await office.gateway.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    },
  };
}
