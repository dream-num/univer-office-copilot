import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createApplication } from '../server/dist/app.js';
import { attachmentPdf, attachmentPng } from '../tests/fixtures/chat-files.ts';

const directory = await mkdtemp(join(tmpdir(), 'copilot-production-smoke-'));
let application;
try {
  application = await createApplication({
    host: '127.0.0.1',
    port: 0,
    demo: true,
    demoExamples: true,
    dataDir: directory,
  });
  const port = await application.start();
  const { user } = await (
    await fetch(`http://127.0.0.1:${port}/api/auth/demo`, { method: 'POST' })
  ).json();
  const { files, office } = application.services;
  const examples = files.list(user.id);
  assert.equal(examples.length, 6);
  assert.equal(new Set(examples.map((file) => file.type)).size, 5);
  for (const table of ['profiles', 'conversations', 'messages', 'runs'])
    assert.equal(application.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
  const file = await files.create(user.id, 'sheet', 'Compiled worker test');
  const conversation = application.services.conversations.create(user.id, file.id);
  const pdf = await application.services.attachments.upload(
    conversation.id,
    user.id,
    attachmentPdf(),
    'compiled.pdf',
  );
  assert.match(application.services.attachments.read(pdf.id, user.id).text, /Revenue target: 128/);
  const image = await application.services.attachments.upload(
    conversation.id,
    user.id,
    attachmentPng,
    'compiled.png',
  );
  assert.equal(
    Buffer.from(application.services.attachments.content(image.id, user.id, true).bytes)
      .subarray(8, 12)
      .toString(),
    'WEBP',
  );
  await office.execute(
    file,
    user.id,
    'smoke',
    'smoke-write',
    {
      kind: 'script.write',
      code: "function label(){return 'Compiled worker saved';}await workbook.getActiveSheet().getRange('A1').setValues([[label()]]);",
    },
    AbortSignal.timeout(30000),
  );
  const loaded = await office.execute(
    file,
    user.id,
    'smoke',
    'smoke-read',
    { kind: 'sheet.read', range: 'A1' },
    AbortSignal.timeout(30000),
  );
  assert.deepEqual(loaded.content, [['Compiled worker saved']]);
  const verified = await office.execute(
    file,
    user.id,
    'smoke',
    'smoke-script-verify',
    {
      kind: 'script.verify',
      code: "const values=workbook.getActiveSheet().getRange('A1').getRawValues();assert(values[0][0]==='Compiled worker saved');return values;",
    },
    AbortSignal.timeout(30000),
  );
  assert.equal(verified.checked, true);
  assert.deepEqual(verified.content.result, [['Compiled worker saved']]);

  assert.match(await readFile('server/dist/skills/core.md', 'utf8'), /Office authoring skill/);
  assert.match(
    await readFile('server/dist/skills/references/board/connector-routing.md', 'utf8'),
    /connector/i,
  );
  const doc = await files.create(user.id, 'doc', 'Compiled Markdown test');
  await office.execute(
    doc,
    user.id,
    'smoke',
    'smoke-markdown',
    {
      kind: 'doc.markdown',
      markdown: ':::block{#summary}\n\n# Production document\n\nA **native** paragraph.\n\n:::',
      mode: 'replace',
    },
    AbortSignal.timeout(30000),
  );
  const preview = await office.visual(doc, user.id, { kind: 'preview', pages: [1] });
  assert.equal(preview.images?.length, 1);
  const imageId = preview.images[0].url.split('/').at(-1);
  const png = await office.readImage(doc.unitId, imageId);
  assert.equal(Buffer.from(png).subarray(1, 4).toString(), 'PNG');
  const readBlock = () =>
    office.execute(
      doc,
      user.id,
      'smoke',
      'smoke-markdown-read',
      { kind: 'doc.markdown.read', blockIds: ['summary'] },
      AbortSignal.timeout(30000),
    );
  const current = await readBlock();
  await office.execute(
    doc,
    user.id,
    'smoke',
    'smoke-markdown-update',
    {
      kind: 'doc.markdown',
      mode: 'replace',
      blockIds: ['summary'],
      markdown: current.content.markdown.replace('native', 'editable'),
    },
    AbortSignal.timeout(30000),
  );
  assert.match((await readBlock()).content.markdown, /editable/);
  assert.match(await readFile('server/dist/skills/references/doc-typst.md', 'utf8'), /Typst/);
  const traditional = await files.create(
    user.id,
    'doc',
    'Compiled Typst test',
    null,
    'traditional',
  );
  await office.execute(
    traditional,
    user.id,
    'smoke',
    'smoke-typst',
    {
      kind: 'doc.typst',
      pages: [
        '#set page(paper: "a4", header: [Production])\n= Native Traditional document\n\nEditable *Typst* content.',
      ],
    },
    AbortSignal.timeout(30000),
  );
  const nativeTraditional = await office.snapshot(traditional, user.id);
  assert.match(JSON.stringify(nativeTraditional), /Editable/);
  assert.deepEqual(
    Object.values(nativeTraditional.headers).map((header) => header.body.dataStream),
    ['Production\r\n'],
  );
  await assert.rejects(
    office.execute(
      traditional,
      user.id,
      'smoke',
      'smoke-invalid-typst',
      {
        kind: 'doc.typst',
        pages: ['#unknown_function()'],
      },
      AbortSignal.timeout(30000),
    ),
    /"diagnostics"/,
  );
  assert.match(JSON.stringify(await office.snapshot(traditional, user.id)), /Editable/);
  assert.equal((await office.visual(traditional, user.id, { kind: 'preview' })).images?.length, 1);
  const slide = await files.create(user.id, 'slide', 'Compiled SVG test');
  await office.execute(
    slide,
    user.id,
    'smoke',
    'smoke-svg',
    {
      kind: 'slide.svg',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#ffffff"/><text x="64" y="100" font-size="40">Measured production slide</text></svg>',
      page: 1,
      mode: 'replace',
    },
    AbortSignal.timeout(30000),
  );
  console.info(
    'Production smoke passed: six clean default examples, compiled PDF/image parser, isolated backend scripts, native assertions, compiled persistence, bundled skills, current-native Markdown updates, native Typst, actual PNGs and measured SVG.',
  );
} finally {
  await application?.close();
  await rm(directory, { recursive: true, force: true });
}
