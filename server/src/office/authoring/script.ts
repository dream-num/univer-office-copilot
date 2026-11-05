import { setImmediate as nextTurn } from 'node:timers/promises';
import { getQuickJS } from 'quickjs-emscripten';
import { prepareContentExecutionProgram } from '@univer-cli/content-execution';
import type { FUniver } from '@univerjs/core/facade';
import type { OfficeFile } from '@univer-copilot/shared';
import { assertFacadeMethod, coreEnums } from './facade.ts';

type Wire =
  | { kind: 'value'; value: string | number | boolean | null }
  | { kind: 'undefined' }
  | { kind: 'handle'; id: string }
  | { kind: 'array'; value: Wire[] }
  | { kind: 'object'; value: Record<string, Wire> };
const roots = {
  sheet: 'getWorkbook',
  doc: 'getDocument',
  slide: 'getPresentation',
  base: 'getBase',
  board: 'getBoard',
} as const;

// The guest has no Node globals or module loader. All native objects stay behind this bridge.
const bootstrap = `
const handles = new WeakMap();
let enumCache;
function unpack(w) {
  if (w.kind === 'undefined') return undefined;
  if (w.kind === 'value') return w.value;
  if (w.kind === 'array') return w.value.map(unpack);
  if (w.kind === 'object') return Object.fromEntries(Object.entries(w.value).map(([k,v])=>[k,unpack(v)]));
  const object = new Proxy(Object.create(null), {
    get(_target, key) {
      if (key === 'then' || typeof key === 'symbol') return undefined;
      if (key === 'Enum' && w.id === 'api') return enumCache ??= unpack(JSON.parse(__officeEnums()));
      if (key.startsWith('_') || ['constructor','prototype','__proto__'].includes(key)) throw Error('Private Facade access is unavailable.');
      return (...args) => {
        const result = __officeCall(w.id, key, JSON.stringify(pack(args)));
        return typeof result === 'string' ? unpack(JSON.parse(result)) : result.then(value => unpack(JSON.parse(value)));
      };
    },
    set() { throw Error('Use public Facade methods to change native content.'); }
  });
  handles.set(object, w.id);
  return object;
}
function pack(value, depth = 0, seen = new Set()) {
  if (depth > 24) throw Error('Script data is too deeply nested.');
  if (value === undefined) return {kind:'undefined'};
  if (typeof value === 'function' || typeof value === 'symbol') throw Error('Native callback arguments are unavailable; use JavaScript loops or array methods around Facade calls.');
  if (typeof value === 'bigint') return {kind:'value',value:String(value)};
  if (value === null || typeof value !== 'object') return {kind:'value',value};
  if (handles.has(value)) return {kind:'handle',id:handles.get(value)};
  if (seen.has(value)) throw Error('Cyclic script data is unavailable.');
  seen.add(value);
  let result;
  if (Array.isArray(value)) result={kind:'array',value:value.map(v=>pack(v,depth+1,seen))};
  else result={kind:'object',value:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,pack(v,depth+1,seen)]))};
  seen.delete(value);
  return result;
}
globalThis.univerAPI = unpack({kind:'handle',id:'api'});
globalThis.assert = (condition, message) => {
  if(condition && typeof condition.then === 'function') throw Error('Await the assertion condition before checking it.');
  return __officeAssert(Boolean(condition), message);
};
const logs=[];
globalThis.console = Object.freeze({log(...args){if(logs.length<40)logs.push(args.map(v=>typeof v==='string'?v:JSON.stringify(pack(v))).join(' ').slice(0,2000));}});
`;

export async function executeFacadeScript(
  api: FUniver,
  file: OfficeFile,
  code: string,
  mode: 'read' | 'write' | 'verify',
  options: { timeoutMs?: number; memoryBytes?: number } = {},
) {
  if (code.length > 50000) throw new Error('The Office script is too large.');
  const program = prepareContentExecutionProgram({
    code,
    unitId: file.unitId,
    unitType: file.type,
  });
  const vm = (await getQuickJS()).newContext();
  const deadline = Date.now() + (options.timeoutMs ?? 15000);
  vm.runtime.setMemoryLimit(options.memoryBytes ?? 64 * 1024 * 1024);
  vm.runtime.setMaxStackSize(512 * 1024);
  vm.runtime.setInterruptHandler(() => Date.now() > deadline);
  const live = new Map<string, unknown>([['api', api]]);
  const ids = new WeakMap<object, string>();
  const pending = new Set<Promise<unknown>>();
  let calls = 0,
    reads = 0,
    assertions = 0,
    assertionFailure = '',
    nativeFailure = '';
  function rejectNative(error: unknown) {
    nativeFailure = error instanceof Error ? error.message : 'Native call failed.';
    return vm.newError(nativeFailure);
  }
  function bounded() {
    if (Date.now() > deadline)
      throw new Error('Office script time limit exceeded. Confirmed edits remain saved.');
    if (++calls > 2000) throw new Error('Office script native-call limit exceeded.');
  }
  function encode(value: unknown, depth = 0): Wire {
    if (depth > 24) throw new Error('Native result is too deeply nested.');
    if (value === undefined) return { kind: 'undefined' };
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    )
      return { kind: 'value', value };
    if (Array.isArray(value))
      return { kind: 'array', value: value.map((v) => encode(v, depth + 1)) };
    if (typeof value !== 'object')
      throw new Error('The native result cannot cross the script boundary.');
    const prototype = Object.getPrototypeOf(value);
    if (prototype && prototype !== Object.prototype) {
      let id = ids.get(value);
      if (!id) {
        id = String(live.size);
        ids.set(value, id);
        live.set(id, value);
      }
      return { kind: 'handle', id };
    }
    return {
      kind: 'object',
      value: Object.fromEntries(
        Object.entries(value).map(([k, v]) => {
          if (['__proto__', 'constructor', 'prototype'].includes(k))
            throw new Error('Prototype keys are unavailable.');
          return [k, encode(v, depth + 1)];
        }),
      ),
    };
  }
  function decode(wire: Wire, depth = 0): unknown {
    if (depth > 24) throw new Error('Script argument is too deeply nested.');
    if (wire.kind === 'undefined') return undefined;
    if (wire.kind === 'value') {
      if (wire.value !== null && !['string', 'number', 'boolean'].includes(typeof wire.value))
        throw new Error('Invalid primitive script argument.');
      return wire.value;
    }
    if (wire.kind === 'handle') {
      if (!live.has(wire.id)) throw new Error('Unknown script handle.');
      return live.get(wire.id);
    }
    if (wire.kind === 'array') {
      if (!Array.isArray(wire.value)) throw new Error('Invalid script array.');
      return wire.value.map((v) => decode(v, depth + 1));
    }
    if (wire.kind !== 'object') throw new Error('Invalid script argument.');
    return Object.fromEntries(
      Object.entries(wire.value).map(([k, v]) => {
        if (['__proto__', 'constructor', 'prototype'].includes(k))
          throw new Error('Prototype keys are unavailable.');
        return [k, decode(v, depth + 1)];
      }),
    );
  }
  const invoke = vm.newFunction('__officeCall', (idValue, methodValue, argsValue) => {
    bounded();
    const id = vm.getString(idValue),
      method = vm.getString(methodValue),
      input = vm.getString(argsValue);
    if (input.length > 4 * 1024 * 1024) throw new Error('Script argument exceeds 4 MiB.');
    const args = decode(JSON.parse(input) as Wire) as unknown[];
    if (!Array.isArray(args)) throw new Error('Native arguments must be an array.');
    if (id === 'api' && method === roots[file.type]) {
      if (args.length !== 1 || args[0] !== file.unitId)
        throw new Error('Only the fixed current Unit may be accessed.');
    } else {
      assertFacadeMethod(method, mode !== 'write');
      if (id === 'api' && !['newRichText', 'getFormula'].includes(method))
        throw new Error('Use the fixed Unit binding; root runtime access is unavailable.');
    }
    const target = live.get(id) as Record<string, unknown> | undefined;
    const fn = target?.[method];
    if (!target || typeof fn !== 'function')
      throw new Error(`Facade method not found: ${method}. Query office_api.`);
    function output(value: unknown) {
      if (value === false && !/^(?:get|find|describe|is|has|analyze)/.test(method))
        throw new Error(`The SDK rejected ${method}. Read current content before retrying.`);
      if (id !== 'api' && /^(?:get|find|describe|is|has|analyze)/.test(method)) reads++;
      const json = JSON.stringify(encode(value));
      if (json.length > 4 * 1024 * 1024)
        throw new Error('Native result exceeds 4 MiB. Read a smaller range.');
      return json;
    }
    const value: unknown = Reflect.apply(fn, target, args);
    if (!value || typeof (value as Promise<unknown>).then !== 'function')
      return vm.newString(output(value));
    const deferred = vm.newPromise();
    const operation = Promise.resolve(value)
      .then(
        (result) => {
          try {
            const h = vm.newString(output(result));
            deferred.resolve(h);
            h.dispose();
          } catch (error) {
            const e = rejectNative(error);
            deferred.reject(e);
            e.dispose();
          }
        },
        (error) => {
          const e = rejectNative(error);
          deferred.reject(e);
          e.dispose();
        },
      )
      .finally(() => {
        pending.delete(operation);
        deferred.dispose();
      });
    pending.add(operation);
    return deferred.handle;
  });
  const enums = vm.newFunction('__officeEnums', () =>
    vm.newString(JSON.stringify(encode({ ...coreEnums, ...api.Enum }))),
  );
  const assert = vm.newFunction('__officeAssert', (condition, message) => {
    assertions++;
    if (!vm.dump(condition)) {
      assertionFailure =
        message && vm.typeof(message) !== 'undefined'
          ? String(vm.dump(message)).slice(0, 1000)
          : 'Office assertion failed.';
      throw new Error(assertionFailure);
    }
    return vm.undefined;
  });
  vm.setProp(vm.global, '__officeCall', invoke);
  vm.setProp(vm.global, '__officeEnums', enums);
  vm.setProp(vm.global, '__officeAssert', assert);
  invoke.dispose();
  enums.dispose();
  assert.dispose();
  try {
    const evaluation = vm.evalCode(
      `${bootstrap}\n(async () => { const result = await (async () => { ${program}\n})(); return JSON.stringify(pack({ result, logs })); })()`,
    );
    const handle = vm.unwrapResult(evaluation);
    try {
      for (;;) {
        const state = vm.getPromiseState(handle);
        if (state.type === 'rejected') {
          const error = vm.dump(state.error);
          state.error.dispose();
          throw new Error(error?.message ?? 'Office script failed.');
        }
        if (state.type === 'fulfilled') {
          try {
            await Promise.allSettled([...pending]);
            if (nativeFailure) throw new Error(nativeFailure);
            if (assertionFailure) throw new Error(assertionFailure);
            if (mode === 'verify' && (!reads || !assertions))
              throw new Error(
                'Verification must read native content and call assert(condition, message).',
              );
            // Return data only; native handles never leave the Office worker.
            const wire = JSON.parse(vm.getString(state.value)) as Wire;
            function data(value: Wire): unknown {
              if (value.kind === 'handle') return { type: 'Facade', handle: value.id };
              if (value.kind === 'array') return value.value.map(data);
              if (value.kind === 'object')
                return Object.fromEntries(
                  Object.entries(value.value).map(([k, v]) => [k, data(v)]),
                );
              return value.kind === 'undefined' ? null : value.value;
            }
            return {
              ...(data(wire) as { result: unknown; logs: string[] }),
              nativeCalls: calls,
              reads,
              assertions,
            };
          } finally {
            state.value.dispose();
          }
        }
        if (Date.now() > deadline) throw new Error('Office script time limit exceeded.');
        if (!vm.runtime.hasPendingJob() && !pending.size)
          throw new Error('The script returned an unresolved promise.');
        const jobs = vm.runtime.executePendingJobs(1);
        if (jobs.error) {
          const error = vm.dump(jobs.error);
          jobs.error.dispose();
          throw new Error(error?.message ?? 'Office script job failed.');
        }
        await Promise.allSettled([...pending]);
        // Drain host completions before advancing the guest promise queue.
        await nextTurn();
      }
    } finally {
      handle.dispose();
    }
  } finally {
    await Promise.allSettled([...pending]);
    await nextTurn();
    vm.dispose();
  }
}
