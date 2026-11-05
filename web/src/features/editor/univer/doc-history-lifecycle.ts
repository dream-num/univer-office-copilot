import { IConfigService, Inject, Injector, Plugin } from '@univerjs/core';
import {
  EDIT_HISTORY_UI_PLUGIN_CONFIG_KEY,
  type IUniverEditHistoryUIConfig,
} from '@univerjs-pro/edit-history-ui';

type RestoreConfig = { restore(revision: number): Promise<void> };

/** Public viewer extension: recreate the host after an acknowledged Doc restore. */
export class DocHistoryLifecyclePlugin extends Plugin {
  static override pluginName = 'OFFICE_COPILOT_DOC_HISTORY_LIFECYCLE';
  constructor(
    private readonly config: RestoreConfig,
    protected readonly _injector: Injector,
  ) {
    super();
  }
  override onRendered() {
    const configs = this._injector.get(IConfigService);
    const viewer = configs.getConfig<IUniverEditHistoryUIConfig>(EDIT_HISTORY_UI_PLUGIN_CONFIG_KEY);
    configs.setConfig(EDIT_HISTORY_UI_PLUGIN_CONFIG_KEY, {
      ...viewer,
      onRestore: async (revision: number) => {
        await this.config.restore(revision);
        viewer.onClose?.();
      },
    } satisfies IUniverEditHistoryUIConfig);
  }
}
// Register the DI parameter without enabling legacy decorators for the application.
Inject(Injector)(DocHistoryLifecyclePlugin, undefined, 1);
