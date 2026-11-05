import { AppError } from '../http/errors.ts';

export function createUnitCoordinator() {
  const active = new Map<string, { runId: string; abort: AbortController; done: Promise<void> }>();
  const restoring = new Set<string>();
  return {
    register(unitId: string, runId: string, abort: AbortController, done: Promise<void>) {
      if (restoring.has(unitId) || active.has(unitId))
        throw new AppError(409, 'UNIT_BUSY', 'This file already has an active operation.');
      active.set(unitId, { runId, abort, done });
      return () => {
        if (active.get(unitId)?.runId === runId) active.delete(unitId);
      };
    },
    cancel(unitId: string, runId: string) {
      const run = active.get(unitId);
      if (run?.runId === runId) run.abort.abort();
    },
    async restore<T>(unitId: string, operation: () => Promise<T>): Promise<T> {
      if (restoring.has(unitId))
        throw new AppError(409, 'UNIT_BUSY', 'A restore is already in progress.');
      restoring.add(unitId);
      try {
        const run = active.get(unitId);
        if (run) {
          run.abort.abort();
          await run.done;
        }
        return await operation();
      } finally {
        restoring.delete(unitId);
      }
    },
    stop() {
      for (const run of active.values()) run.abort.abort();
      return Promise.allSettled([...active.values()].map((x) => x.done));
    },
  };
}
export type UnitCoordinator = ReturnType<typeof createUnitCoordinator>;
