import type { FUniver } from '@univerjs/core/facade';
import {
  SpacingRule,
  BorderStyleTypes,
  HorizontalAlign,
  VerticalAlign,
  BooleanNumber,
  NamedStyleType,
  PresetListType,
} from '@univerjs/core';
import type { OfficeAction, OfficeFile } from '@univer-copilot/shared';

type Plan = Extract<OfficeAction, { kind: 'facade.read' | 'facade.write' }>;
const forbidden =
  /^(?:_|constructor$|prototype$|then$|catch$|dispose|register|execute|load|save$|undo$|redo$|get.*(?:Injector|Service|Model|Permission))/;
const readable = /^(?:get|find|describe|is|has|analyze)/;
const rootBuilders = new Set(['newRichText', 'getFormula']);
export const coreEnums = {
  SpacingRule,
  BorderStyleTypes,
  HorizontalAlign,
  VerticalAlign,
  BooleanNumber,
  NamedStyleType,
  PresetListType,
};

export function assertFacadeMethod(method: string, readOnly: boolean) {
  safeKey(method);
  if (forbidden.test(method) || /get.*(?:Univer|Runtime|Auth|Network|Token|Context)/.test(method))
    throw new Error(`Unavailable Facade method: ${method}`);
  if (readOnly && !readable.test(method))
    throw new Error('Read-only scripts and plans may call only read methods.');
}

function safeKey(key: string) {
  if (key.startsWith('_') || ['constructor', 'prototype', '__proto__'].includes(key))
    throw new Error('Private and prototype access is not allowed.');
  return key;
}

/** JSON method calls retain native Facade handles without evaluating model-authored JavaScript. */
export async function executeFacadePlan(api: FUniver, file: OfficeFile, plan: Plan) {
  if (JSON.stringify(plan).length > 100000) throw new Error('The Facade plan is too large.');
  const roots = {
    sheet: api.getWorkbook.bind(api),
    doc: api.getDocument.bind(api),
    slide: api.getPresentation.bind(api),
    base: api.getBase.bind(api),
    board: api.getBoard.bind(api),
  };
  const unit = roots[file.type](file.unitId);
  if (!unit) throw new Error('The target Unit is not loaded.');
  const handles = new Map<string, unknown>([
    ['unit', unit],
    ['api', api],
  ]);
  function argument(value: unknown, depth = 0): unknown {
    if (depth > 20) throw new Error('The Facade argument is too deeply nested.');
    if (Array.isArray(value)) return value.map((item) => argument(item, depth + 1));
    if (!value || typeof value !== 'object') return value;
    const object = value as Record<string, unknown>;
    if (typeof object.ref === 'string') {
      if (!handles.has(object.ref)) throw new Error(`Unknown handle: ${object.ref}`);
      let result = handles.get(object.ref);
      for (const part of (object.path as (string | number)[] | undefined) ?? []) {
        const key = safeKey(String(part));
        if (!result || typeof result !== 'object' || !Object.hasOwn(result, key))
          throw new Error(`Unknown result property: ${key}`);
        result = (result as Record<string, unknown>)[key];
      }
      return result;
    }
    if (typeof object.enum === 'string') {
      const parts = object.enum.replace(/^FEnum\./, '').split('.');
      let result: unknown = Object.hasOwn(api.Enum, parts[0]!) ? api.Enum : coreEnums;
      for (const part of parts) {
        const key = safeKey(part);
        if (!result || typeof result !== 'object' || !Object.hasOwn(result, key))
          throw new Error(`Unknown SDK enum: ${object.enum}`);
        result = (result as Record<string, unknown>)[key];
      }
      if (typeof result === 'function') throw new Error('Functions are not enum arguments.');
      return result;
    }
    return Object.fromEntries(
      Object.entries(object).map(([key, item]) => {
        if (['constructor', 'prototype', '__proto__'].includes(key))
          throw new Error('Prototype keys are not data arguments.');
        return [key, argument(item, depth + 1)];
      }),
    );
  }
  const results: unknown[] = [];
  function describe(value: unknown, depth = 0): unknown {
    if (value === undefined) return null;
    if (!value || typeof value !== 'object') return value;
    if (depth > 8) return '[nested result omitted]';
    if (Array.isArray(value)) return value.slice(0, 200).map((item) => describe(item, depth + 1));
    const prototype = Object.getPrototypeOf(value);
    if (prototype && prototype !== Object.prototype) {
      const id = 'getId' in value && typeof value.getId === 'function' ? value.getId() : undefined;
      return {
        type: prototype.constructor?.name ?? 'Facade',
        ...(typeof id === 'string' ? { id } : {}),
      };
    }
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 200)
        .map(([key, item]) => [key, describe(item, depth + 1)]),
    );
  }
  for (const call of plan.calls) {
    assertFacadeMethod(call.method, plan.kind === 'facade.read');
    if (call.target === 'api' && !rootBuilders.has(call.method))
      throw new Error(
        'Use the fixed Unit handle; root runtime and service access are unavailable.',
      );
    if (call.saveAs && ['unit', 'api'].includes(call.saveAs))
      throw new Error('Reserved handles cannot be replaced.');
    const target = handles.get(call.target) as Record<string, unknown> | undefined;
    const method = target?.[call.method];
    if (!target || typeof method !== 'function')
      throw new Error(`Facade method not found: ${call.target}.${call.method}. Query office_api.`);
    const value: unknown = await Reflect.apply(
      method,
      target,
      call.args.map((item) => argument(item)),
    );
    if (
      (value === false && !readable.test(call.method)) ||
      (value === null && /^(?:insert|add|new)/.test(call.method))
    )
      throw new Error(
        `The SDK rejected ${call.target}.${call.method}; inspect the current state before retrying.`,
      );
    if (call.saveAs) handles.set(call.saveAs, value);
    results.push({ ...(call.saveAs ? { handle: call.saveAs } : {}), value: describe(value) });
  }
  return results;
}
