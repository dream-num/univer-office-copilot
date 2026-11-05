import { prepareContentExecutionProgram } from '@univer-cli/content-execution';
import type { FUniver } from '@univerjs/core/facade';
import type { OfficeFile } from '@univer-copilot/shared';

/** Only SDK-generated inspection/compiler programs enter this function; never model-supplied JS. */
export async function executeSdkProgram(api: FUniver, file: OfficeFile, code: string) {
  const program = prepareContentExecutionProgram({
    code,
    unitId: file.unitId,
    unitType: file.type,
  });
  return executeInspectionProgram(api, program);
}

/** Inspection already generates its own Unit bindings; adding a second prelude rejects reserved names. */
export function executeInspectionProgram(api: FUniver, program: string): Promise<unknown> {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  return new AsyncFunction('univerAPI', program)(api) as Promise<unknown>;
}
