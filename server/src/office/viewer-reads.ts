import {
  CollabError,
  type IUniverCollabService,
  type IUnitSnapshotMaterializer,
  type ISnapshotWithBlocks,
  type CollabContext,
  type GetUnitLoadDataInput,
} from '@univerjs-pro/collaboration-service';

/** Serve viewers a materialized current snapshot, never an old snapshot plus historical changesets. */
export function createViewerReads(
  service: IUniverCollabService,
  materializer: IUnitSnapshotMaterializer,
  authorize: (actor: string, unit: string, access: 'read' | 'history') => void,
) {
  const views = new Map<string, { value: ISnapshotWithBlocks; floor: number; at: number }>();
  const key = (actor: string, unit: string) => `${actor}:${unit}`;
  function history(actor: string, unit: string) {
    try {
      authorize(actor, unit, 'history');
      return true;
    } catch {
      return false;
    }
  }
  async function load(input: GetUnitLoadDataInput, context: CollabContext) {
    authorize(context.userID, input.unitID, input.revision ? 'history' : 'read');
    if (history(context.userID, input.unitID))
      return service.getUnitLoadDataWithBlocks(input, context);
    const data = await service.getUnitLoadDataWithBlocks(input, context);
    const value = await materializer.materializeSnapshot(data);
    if (views.size >= 256) views.delete(views.keys().next().value!);
    views.set(key(context.userID, input.unitID), {
      value,
      floor: data.targetRevision,
      at: Date.now(),
    });
    return { ...value, changesets: [], targetRevision: data.targetRevision };
  }
  function view(actor: string, unit: string) {
    authorize(actor, unit, 'read');
    const value = views.get(key(actor, unit));
    if (!value || Date.now() - value.at > 3600000)
      throw new CollabError(
        'PERMISSION_DENIED',
        'Reload the current file before fetching its data.',
      );
    return value;
  }
  const endpointService: Omit<IUniverCollabService, 'dbAdapter'> = {
    get license() {
      return service.license;
    },
    use: service.use.bind(service),
    on: service.on.bind(service),
    async getUnitLoadData(input, context) {
      const { sheetBlocks: _blocks, ...data } = await load(input, context);
      return data;
    },
    getUnitLoadDataWithBlocks: load,
    getChangesets(input, context) {
      if (
        !history(context.userID, input.unitID) &&
        input.from <= view(context.userID, input.unitID).floor
      )
        throw new CollabError('PERMISSION_DENIED', 'Earlier file changes are private.');
      return service.getChangesets(input, context);
    },
    getSheetBlock(input, context) {
      if (history(context.userID, input.unitID)) return service.getSheetBlock(input, context);
      const block = view(context.userID, input.unitID).value.sheetBlocks.find(
        (value) => value.id === input.blockID,
      );
      if (!block)
        throw new CollabError(
          'PERMISSION_DENIED',
          'This block is not part of the current shared snapshot.',
        );
      return Promise.resolve({ block });
    },
    createUnitFromSnapshot: service.createUnitFromSnapshot.bind(service),
    createUnitFromData: service.createUnitFromData.bind(service),
    deleteUnits: service.deleteUnits.bind(service),
    recoverUnits: service.recoverUnits.bind(service),
    submitChangeset: service.submitChangeset.bind(service),
    dispose: async () => {
      views.clear();
    },
  };
  return {
    service: endpointService,
    invalidate(unitId: string) {
      for (const id of views.keys()) if (id.endsWith(`:${unitId}`)) views.delete(id);
    },
  };
}
