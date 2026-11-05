import { createApplication } from './app.ts';

const host = process.env.HOST ?? '127.0.0.1';
const application = await createApplication({
  host,
  port: Number(process.env.PORT ?? 3100),
  demo: process.env.DEMO_MODE !== 'false',
  demoExamples: process.env.DEMO_EXAMPLES !== 'false',
  dataDir: process.env.DATA_DIR ?? '.data',
});
const port = await application.start();
console.info(`Univer Office Copilot: http://${host}:${port}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void application.close().catch(() => {
      process.exitCode = 1;
    });
  });
