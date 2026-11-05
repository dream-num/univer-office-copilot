import { Univer, LocaleType } from '@univerjs/core';
import { UniverLicensePlugin } from '@univerjs-pro/license';
import { UniverProFormulaEnginePlugin } from '@univerjs-pro/engine-formula';
import { UniverRemoteBasesPlugin } from '@univerjs-pro/bases';
import { UniverRemoteBaseDashboardPlugin } from '@univerjs-pro/bases-dashboard';
import { UniverRPCWorkerThreadPlugin } from '@univerjs/rpc';
self.addEventListener(
  'message',
  function initialize(event: MessageEvent<{ type: string; license: string }>) {
    if (event.data.type !== 'copilot.initialize') return;
    self.removeEventListener('message', initialize);
    const univer = new Univer({ locale: LocaleType.EN_US });
    univer.registerPlugin(UniverLicensePlugin, { license: event.data.license || undefined });
    univer.registerPlugin(UniverProFormulaEnginePlugin);
    univer.registerPlugin(UniverRemoteBasesPlugin);
    univer.registerPlugin(UniverRemoteBaseDashboardPlugin);
    univer.registerPlugin(UniverRPCWorkerThreadPlugin);
    self.postMessage({ type: 'copilot.ready' });
  },
);
