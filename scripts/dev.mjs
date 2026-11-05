import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { build } from 'vite';
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Use Node.js 24 or newer.');
if (!existsSync('server/dist/render-page/index.html'))
  await build({ configFile: 'server/render.vite.config.ts' });
const children = [
  spawn(
    process.execPath,
    [
      '--env-file-if-exists=.env',
      '--env-file-if-exists=.env.local',
      '--import',
      'tsx',
      '--watch',
      'server/src/bootstrap/main.ts',
    ],
    { stdio: 'inherit' },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
  const timer = setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
  }, 5000);
  timer.unref();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
function watch(child) {
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
}
watch(children[0]);
let healthy = false;
for (let attempt = 0; attempt < 150 && !stopping; attempt++) {
  try {
    healthy = (await fetch('http://127.0.0.1:3100/health')).ok;
    if (healthy) break;
  } catch {
    /* The API is still loading its SDK modules. */
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
if (healthy && !stopping) {
  const web = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--config', 'web/vite.config.ts'],
    { stdio: 'inherit' },
  );
  children.push(web);
  watch(web);
} else {
  if (!stopping) console.error('The application API did not become ready.');
  stop(1);
}
