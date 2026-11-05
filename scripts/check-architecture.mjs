import ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const errors = [];
const edges = new Map();
const tables = {
  users: ['auth'],
  sessions: ['auth'],
  folders: ['files'],
  files: ['files'],
  permissions: ['files'],
  file_links: ['files'],
  conversations: ['conversations'],
  messages: ['conversations'],
  attachments: ['attachments'],
  conversation_links: ['conversations'],
  profiles: ['providers'],
  runs: ['copilot'],
  run_events: ['copilot'],
  run_changes: ['copilot'],
  operations: ['files', 'copilot'],
};
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.tsx?$/.test(path)) await inspect(path);
  }
}
function feature(path) {
  return path.match(/^(?:web\/src\/features|server\/src\/modules)\/([^/]+)/)?.[1];
}
async function inspect(path) {
  const name = relative(root, path).replaceAll('\\', '/');
  const source = ts.createSourceFile(
    path,
    await readFile(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  function fail(message) {
    errors.push(`${name}: ${message}`);
  }
  function visit(node) {
    let specifier;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      specifier = node.moduleSpecifier.text;
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      ts.isStringLiteral(node.arguments[0])
    )
      specifier = node.arguments[0].text;
    if (specifier) {
      const target = specifier.startsWith('.')
        ? relative(root, resolve(dirname(path), specifier)).replaceAll('\\', '/')
        : specifier;
      if (name.startsWith('web/') && (target.startsWith('server/') || /node:/.test(target)))
        fail(`browser imports server code: ${specifier}`);
      if (name.startsWith('server/') && target.startsWith('web/'))
        fail(`server imports browser code: ${specifier}`);
      const from = name.match(/^(web\/src\/features|server\/src\/modules)\/[^/]+/)?.[0];
      const to = target.match(/^(web\/src\/features|server\/src\/modules)\/[^/]+/)?.[0];
      if (from && to && from !== to) {
        if (!edges.has(from)) edges.set(from, new Set());
        edges.get(from).add(to);
      }
      if (
        name.startsWith('shared/') &&
        !['zod'].includes(specifier) &&
        !target.startsWith('shared/')
      )
        fail(`shared imports runtime code: ${specifier}`);
      if (
        feature(name) &&
        feature(target) &&
        feature(name) !== feature(target) &&
        !target.endsWith('/index.ts')
      )
        fail(`cross-feature import bypasses public API: ${specifier}`);
      if (
        specifier.startsWith('@univerjs') &&
        !(
          name.startsWith('server/src/office/') ||
          name.startsWith('web/src/features/editor/univer/')
        )
      )
        fail(`SDK import outside Office adapter: ${specifier}`);
      if (
        /^@?langchain/.test(specifier) &&
        !(
          name.startsWith('server/src/modules/providers/') ||
          name.startsWith('server/src/modules/copilot/') ||
          name.startsWith('server/tests/')
        )
      )
        fail(`model runtime import outside AI adapters: ${specifier}`);
      if (
        specifier.startsWith('@assistant-ui') &&
        !name.startsWith('web/src/features/copilot/assistant-ui/')
      )
        fail(`chat UI import outside UI adapter: ${specifier}`);
      if (
        /^@univerjs[^/]*\/[^/]+\/(?:src|lib|dist)\//.test(specifier) &&
        !specifier.endsWith('/lib/index.css')
      )
        fail(`private SDK import: ${specifier}`);
    }
    if (
      name.startsWith('server/src/modules/') &&
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ) {
      for (const match of node.text.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_]+)\b/gi)) {
        const owners = tables[match[1].toLowerCase()];
        if (owners && !owners.includes(feature(name)))
          fail(`SQL accesses another module's table: ${match[1]}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
for (const directory of ['web/src', 'server/src', 'shared/src'])
  await walk(resolve(root, directory));
function checkCycle(node, path = []) {
  if (path.includes(node)) {
    errors.push(`Module import cycle: ${[...path, node].join(' -> ')}`);
    return;
  }
  for (const next of edges.get(node) ?? []) checkCycle(next, [...path, node]);
}
for (const module of edges.keys()) checkCycle(module);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'Architecture passed: package isolation, public APIs, vendor adapters, SQL ownership, and acyclic module imports.',
  );
