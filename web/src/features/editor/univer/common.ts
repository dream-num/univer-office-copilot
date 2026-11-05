import {
  IAuthzIoService,
  IMentionIOService,
  IUndoRedoService,
  LocaleType,
  LogLevel,
  Univer,
  type ILanguagePack,
} from '@univerjs/core';
import { createUniver, mergeLocales, type IPreset } from '@univerjs/presets';
import { defaultTheme } from '@univerjs/themes';
import { UniverLicensePlugin } from '@univerjs-pro/license';
import { UniverCollaborationClientUIPlugin } from '@univerjs-pro/collaboration-client-ui';
import { UniverRenderEnginePlugin } from '@univerjs/engine-render';
import { UniverUIPlugin } from '@univerjs/ui';
import { UniverDrawingPlugin } from '@univerjs/drawing';
import UIEnUS from '@univerjs/ui/locale/en-US';
import DocsUIEnUS from '@univerjs/docs-ui/locale/en-US';
import DesignEnUS from '@univerjs/design/locale/en-US';
import DrawingUIEnUS from '@univerjs/drawing-ui/locale/en-US';
import ShapeEditorUIEnUS from '@univerjs-pro/shape-editor-ui/locale/en-US';
import ThreadCommentUIEnUS from '@univerjs/thread-comment-ui/locale/en-US';
import '@univerjs/design/lib/index.css';
import '@univerjs/ui/lib/index.css';
import '@univerjs/docs-ui/lib/index.css';
import '@univerjs/drawing-ui/lib/index.css';
import '@univerjs/thread-comment-ui/lib/index.css';

export const MAX_IMAGE_BYTES = 1024 * 1024;

export type HostConfig = {
  container: HTMLElement;
  license: string;
  plugins: NonNullable<Parameters<typeof createUniver>[0]['plugins']>;
};
export function presetHost(
  config: HostConfig,
  locales: ILanguagePack,
  core: IPreset,
  features: IPreset[],
) {
  return {
    univer: createUniver({
      locale: LocaleType.EN_US,
      locales: { [LocaleType.EN_US]: locales },
      theme: defaultTheme,
      logLevel: LogLevel.ERROR,
      collaboration: true,
      presets: [
        { plugins: [[UniverLicensePlugin, { license: config.license || undefined }]] },
        core,
        { plugins: [[UniverDrawingPlugin, { allowImageSize: MAX_IMAGE_BYTES }]] },
        { plugins: config.plugins },
        // Configure shared IO, licensing and collaboration before feature UI starts.
        ...features.map((preset) => ({
          ...preset,
          plugins: preset.plugins.filter((plugin) => {
            const owner = Array.isArray(plugin) ? plugin[0] : plugin;
            return owner !== UniverLicensePlugin && owner !== UniverDrawingPlugin;
          }),
        })),
      ],
    }).univer,
  };
}
export function proHost(config: HostConfig, locales: ILanguagePack, toolbar = true) {
  const univer = new Univer({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(
        DesignEnUS,
        UIEnUS,
        DocsUIEnUS,
        DrawingUIEnUS,
        ShapeEditorUIEnUS,
        ThreadCommentUIEnUS,
        locales,
      ),
    },
    theme: defaultTheme,
    logLevel: LogLevel.ERROR,
    override: [
      [IAuthzIoService, null],
      [IMentionIOService, null],
      [IUndoRedoService, null],
    ],
  });
  univer.registerPlugin(UniverLicensePlugin, { license: config.license || undefined });
  univer.registerPlugin(UniverRenderEnginePlugin);
  univer.registerPlugin(UniverDrawingPlugin, { allowImageSize: MAX_IMAGE_BYTES });
  univer.registerPlugin(UniverUIPlugin, {
    container: config.container,
    header: toolbar,
    toolbar,
    footer: toolbar,
    ribbonType: 'grid',
  });
  for (const plugin of config.plugins) {
    const value = Array.isArray(plugin) ? plugin[0] : plugin;
    if (value === UniverCollaborationClientUIPlugin) continue;
    if (Array.isArray(plugin)) univer.registerPlugin(plugin[0], plugin[1]);
    else univer.registerPlugin(plugin);
  }
  return univer;
}
export function finishHost(univer: Univer, config: HostConfig) {
  univer.registerPlugin(UniverCollaborationClientUIPlugin);
  return { univer };
}
