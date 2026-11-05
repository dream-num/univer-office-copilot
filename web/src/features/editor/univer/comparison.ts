import {
  UnitComparisonDetailLevel,
  UnitComparisonFidelity,
  UnitComparisonReadiness,
} from '@univerjs-pro/edit-history';
import {
  getUnitComparisonEntityLabel,
  getUnitComparisonPathLabels,
  getUnitComparisonValueLabel,
  type IUnitComparisonLabelDescriptor,
} from '@univerjs-pro/edit-history-ui';
import { LocaleService, type Univer } from '@univerjs/core';
import type { FUniver } from '@univerjs/core/facade';
import type { OfficeFile } from '@univer-copilot/shared';
import type { PreparedVersionComparison, VersionSnapshot } from '../types.ts';
import '@univerjs-pro/edit-history/facade';

const unitTypes = { doc: 1, sheet: 2, slide: 3, base: 5, board: 6 } as const;

export function compareVersions(
  univer: Univer,
  api: FUniver,
  file: OfficeFile,
  before: VersionSnapshot,
  after: VersionSnapshot,
): PreparedVersionComparison {
  if (
    [before, after].some(
      (snapshot) => snapshot.unitId !== file.unitId || snapshot.type !== file.type,
    )
  )
    throw new Error('The compared versions must belong to the current file.');
  const locale = univer.__getInjector().get(LocaleService);
  const label = (descriptor: IUnitComparisonLabelDescriptor) =>
    locale.t(descriptor.key, ...(descriptor.args ?? []));
  const prepared = api.prepareUnitComparison({
    comparisonId: `${file.id}:${before.revision}:${after.revision}`,
    unitId: file.unitId,
    unitName: file.name,
    type: unitTypes[file.type],
    fidelity: UnitComparisonFidelity.SNAPSHOT,
    commonBaseRevision: before.revision,
    leftData: before.data,
    rightData: after.data,
  });
  return {
    query(offset = 0) {
      const result = prepared.query({
        offset,
        limit: 50,
        detail: UnitComparisonDetailLevel.CHANGES,
      });
      return {
        total: result.page.matched,
        hasMore: result.page.hasMore,
        approximate: result.diagnostics.readiness !== UnitComparisonReadiness.READY,
        items: result.items.map((item) => {
          const scope = result.scopes.find((scope) => scope.stableId === item.scope?.stableId);
          const entity = label(getUnitComparisonEntityLabel(item.entityType));
          const name =
            file.type === 'sheet' && item.entityType === 'cell'
              ? ((item.locations.right ?? item.locations.left)?.stableId ?? item.stableId)
              : (item.displayName ?? entity);
          const value = (path: readonly string[], data: unknown) => {
            const descriptor = getUnitComparisonValueLabel(item.entityType, path, data);
            if (descriptor) return label(descriptor);
            if (data === undefined || data === null) return '—';
            return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
          };
          return {
            id: item.id,
            label: [...new Set([scope?.displayName, name])].filter(Boolean).join(' · '),
            kind: item.kind,
            details: item.changes.map((change) => ({
              field: getUnitComparisonPathLabels(change.path).map(label).join(' / ') || entity,
              before: value(change.path, change.before),
              after: value(change.path, change.after),
            })),
          };
        }),
      };
    },
  };
}
