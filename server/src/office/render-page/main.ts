import { createPresetRenderUniver, mountUniverRenderPage } from '@univer-cli/univer-render-page';

await mountUniverRenderPage({
  container: document.querySelector<HTMLElement>('#app')!,
  createUniver: createPresetRenderUniver,
});
