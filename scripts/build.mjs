import { build } from 'vite';
import { cp } from 'node:fs/promises';
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Use Node.js 24 or newer.');
await build({ configFile: 'web/vite.config.ts' });
await build({ configFile: 'server/vite.config.ts' });
await cp('server/src/modules/copilot/skills', 'server/dist/skills', {
  recursive: true,
  filter: (source) => !source.endsWith('.ts'),
});
await build({ configFile: 'server/render.vite.config.ts' });
