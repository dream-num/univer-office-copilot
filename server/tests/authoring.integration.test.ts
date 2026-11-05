import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApplication } from '../src/bootstrap/app.ts';
import { createOfficeVerification } from '../src/modules/copilot/verification.ts';
import { NamedStyleType } from '@univerjs/core';
import type { OfficeAction, OfficeFile } from '@univer-copilot/shared';

describe('AI SDK native authoring and rendered verification', () => {
  let app: Awaited<ReturnType<typeof createApplication>>,
    directory: string,
    actor: string,
    origin: string,
    cookie: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'copilot-authoring-'));
    app = await createApplication({ host: '127.0.0.1', port: 0, demo: true, dataDir: directory });
    origin = `http://127.0.0.1:${await app.start()}`;
    const response = await fetch(`${origin}/api/auth/demo`, { method: 'POST' });
    cookie = response.headers.get('set-cookie')!.split(';')[0]!;
    actor = (await response.json()).user.id;
  });
  afterAll(async () => {
    await app?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const execute = (file: OfficeFile, action: OfficeAction) =>
    app.services.office.execute(
      file,
      actor,
      randomUUID(),
      randomUUID(),
      action,
      AbortSignal.timeout(90000),
    );

  const scripts = [
    {
      type: 'sheet',
      code: `const sheet=workbook.getActiveSheet();
      const rows=Array.from({length:4},(_,i)=>[{v:i+1,t:2},{f:'=A'+(i+1)+'*2'}]);
      await sheet.getRange('A1:B4').setValues(rows);return rows.length;`,
      verify: `const values=workbook.getActiveSheet().getRange('A1:B4').getRawValues();assert(values.length===4&&values[3][1]===8,'Calculated totals differ');return values;`,
      target: { range: 'A1:D6' },
    },
    {
      type: 'doc',
      code: `for(const label of ['First native paragraph','Second native paragraph']) {const p=await doc.appendParagraph(label);assert(p.getText()===label);}return doc.getParagraphs().map(p=>p.getText());`,
      verify: `const texts=doc.getParagraphs().map(p=>p.getText());assert(texts.includes('Second native paragraph'),'Missing saved paragraph');return texts;`,
      target: { pages: [1] },
    },
    {
      type: 'slide',
      code: `const page=presentation.getSlides()[0];for(const [i,label] of ['Native title','Native detail'].entries()){const shape=await page.insertShape({shapeType:univerAPI.Enum.ShapeTypeEnum.Rect,transform:{left:64,top:64+i*160,width:600,height:100}});await shape.setSolidFill('#F1F4FA');await shape.getText().setText(label);await shape.getText().setFontSize(28);}return page.getElements().map(e=>e.getId());`,
      verify: `const page=presentation.getSlides()[0];const texts=page.getElements().map(e=>page.getShape(e.getId())?.getText().getPlainText()??'');assert(texts.includes('Native title')&&texts.includes('Native detail'),'Missing saved slide text');return texts;`,
      target: { pages: [1] },
    },
    {
      type: 'base',
      code: `const table=base.getTables()[0];const name=table.getFieldByName('Name');const budget=await table.addField('Budget',univerAPI.Enum.BaseFieldType.Currency);for(let i=1;i<=3;i++)await table.addRecord({[name.getId()]:'Project '+i,[budget.getId()]:i*100});return table.getRecords().map(r=>r.getValues());`,
      verify: `const table=base.getTables()[0];const field=table.getFieldByName('Budget');const rows=table.getRecords().map(r=>r.getValues());assert(rows.length===3&&rows.reduce((sum,r)=>sum+Number(r[field.getId()]),0)===600,'Budget totals differ');return rows;`,
      target: {},
    },
    {
      type: 'board',
      code: `const ids=[];for(const [i,label] of ['Validate','Deliver'].entries()){const node=await board.insertShape({shapeType:univerAPI.Enum.ShapeTypeEnum.RoundRect,transform:{left:80+i*320,top:120,width:220,height:100}});await node.setSolidFill('#F1F4FA');await node.getText().setText(label);ids.push(node.getId());}await board.insertConnector({fromElementId:ids[0],toElementId:ids[1],style:{endMarker:{type:'filledTriangle',size:'md'}}});return ids;`,
      verify: `const items=board.describeElements();const text=JSON.stringify(items);assert(text.includes('Validate')&&text.includes('Deliver')&&text.includes('connector'),'Missing persisted diagram semantics');return items;`,
      target: {},
    },
  ] satisfies {
    type: OfficeFile['type'];
    code: string;
    verify: string;
    target: { pages?: number[]; range?: string };
  }[];
  for (const sample of scripts)
    it(`executes isolated ${sample.type} scripts, reloads collaboration state, asserts and renders`, async () => {
      const file = await app.services.files.create(actor, sample.type, 'Script ' + sample.type);
      const before = await app.services.office.revision(file, actor);
      const result = await execute(file, { kind: 'script.write', code: sample.code });
      expect(result.checked).toBe(true);
      expect(await app.services.office.revision(file, actor)).toBeGreaterThan(before);
      const verifier = createOfficeVerification({
        office: app.services.office,
        file,
        actor,
        runId: randomUUID(),
        signal: AbortSignal.timeout(60000),
        latestChange: () => 1,
        publish: async (result) => result,
      });
      const verified = await verifier.verify({
        code: sample.verify,
        target: sample.target,
        intentionalWarnings: [],
      });
      expect(verified.preview.images!.length).toBeGreaterThan(0);
      expect(verified.findings).toEqual([]);
      expect(verified.readback.checked).toBe(true);
      await expect(execute(file, { kind: 'script.read', code: sample.code })).rejects.toThrow();
    }, 90000);

  it('turns Markdown into native headings, rich text, lists and a table, and reloads it', async () => {
    const file = await app.services.files.create(actor, 'doc', 'Native Markdown');
    const result = await execute(file, {
      kind: 'doc.markdown',
      mode: 'replace',
      markdown:
        '# Quarterly brief\n\nRevenue grew **18.86%** with _stable_ retention.\n\n## Next steps\n\n1. Validate demand\n2. Deliver a pilot\n\n| Owner | Budget |\n| --- | --- |\n| Alex | 6000 |\n| Sam | 4000 |\n\n> Review risk before delivery.',
    });
    expect(result.checked).toBe(true);
    const data = (await app.services.office.snapshot(file, actor)) as {
      body: {
        dataStream: string;
        paragraphs: { paragraphStyle?: { namedStyleType?: NamedStyleType } }[];
        textRuns: { ts: { bl?: number } }[];
      };
    };
    expect(data.body.dataStream).toContain('Quarterly brief');
    expect(
      data.body.paragraphs.some(
        (p) => p.paragraphStyle?.namedStyleType === NamedStyleType.HEADING_1,
      ),
    ).toBe(true);
    expect(data.body.textRuns.some((run) => run.ts.bl === 1)).toBe(true);
    const tables = await execute(file, {
      kind: 'facade.read',
      calls: [{ target: 'unit', method: 'getTables', args: [] }],
    });
    expect((tables.content as { value: unknown[] }[])[0]!.value).toHaveLength(1);
    const preview = await app.services.office.visual(file, actor, { kind: 'preview', pages: [1] });
    expect(preview.images).toHaveLength(1);
    expect(preview.images![0]!.width).toBeGreaterThan(300);
  });

  it('uses SDK Markdown blocks, columns, links, callouts and images without overwriting later native edits', async () => {
    const file = await app.services.files.create(actor, 'doc', 'Modern SDK blocks');
    await execute(file, {
      kind: 'doc.markdown',
      mode: 'replace',
      markdown:
        '# Quarterly report\n\n:::block{#summary}\n\nRevenue is **523**. [Source](https://univer.ai)\n\n:::\n\n::::columns{#comparison}\n\n:::column{#left}\n\n## East\n\nPreserve this note.\n\n:::\n\n:::column{#right}\n\n## North\n\nNative right column.\n\n:::\n\n::::\n\n:::callout{#notice}\n\nReview before release.\n\n:::\n\n::image{#logo src="assets/logo.svg" width="120"}\n\n:::block{#metrics}\n\n| Quarter | Revenue |\n| --- | --- |\n| Q1 | 440 |\n| Q2 | 523 |\n\n:::',
      assets: {
        'assets/logo.svg': {
          data: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" rx="6" fill="#27272a"/></svg>',
          encoding: 'utf8',
          mimeType: 'image/svg+xml',
        },
      },
    });
    const native = await execute(file, {
      kind: 'facade.read',
      calls: [
        { target: 'unit', method: 'getColumnGroups', args: [] },
        { target: 'unit', method: 'getCallouts', args: [] },
        { target: 'unit', method: 'getImages', args: [] },
        { target: 'unit', method: 'getTables', args: [] },
      ],
    });
    expect((native.content as { value: unknown[] }[]).map((item) => item.value.length)).toEqual([
      1, 1, 1, 1,
    ]);
    await execute(file, {
      kind: 'facade.write',
      calls: [
        {
          target: 'unit',
          method: 'findParagraphByText',
          args: ['Preserve this note.'],
          saveAs: 'note',
        },
        { target: 'note', method: 'setText', args: ['Manual edit must survive.'] },
      ],
    });
    const before = await app.services.office.snapshot(file, actor);
    const read = await execute(file, { kind: 'doc.markdown.read', blockIds: ['summary'] });
    const fragment = (read.content as { markdown: string }).markdown;
    expect(fragment).toContain('https://univer.ai');
    await execute(file, {
      kind: 'doc.markdown',
      mode: 'replace',
      blockIds: ['summary'],
      markdown: fragment.replace('523', '590'),
    });
    const current = await execute(file, { kind: 'doc.markdown.read', blockIds: ['summary'] });
    await execute(file, {
      kind: 'doc.markdown',
      mode: 'replace',
      blockIds: ['summary'],
      markdown: (current.content as { markdown: string }).markdown.replace('590', '600'),
    });
    const after = await app.services.office.snapshot(file, actor);
    expect(JSON.stringify(after)).toContain('Manual edit must survive.');
    expect(JSON.stringify(after)).toContain('600');
    await execute(file, { kind: 'doc.markdown.read', blockIds: ['summary'] });
    expect(after.drawingsOrder).toEqual(before.drawingsOrder);
    const untouched = (value: Record<string, unknown>) =>
      (value.body as { paragraphs: { paragraphId: string }[] }).paragraphs.map(
        (p) => p.paragraphId,
      );
    const summaryIds = new Set(
      (before.body as { paragraphs: { paragraphId: string }[] }).paragraphs
        .slice(1, 2)
        .map((p) => p.paragraphId),
    );
    expect(untouched(after).filter((id) => !summaryIds.has(id))).toEqual(
      expect.arrayContaining(untouched(before).filter((id) => !summaryIds.has(id))),
    );
    await execute(file, {
      kind: 'doc.markdown',
      mode: 'append',
      markdown: '## Appended\n\nAn SDK-generated addition.',
    });
    const priorVersion = (await app.services.office.versions(file, actor))[0]!;
    await execute(file, {
      kind: 'doc.markdown',
      mode: 'replace',
      markdown: ':::block{#replacement}\n\n# Replacement\n\nNew generated body.\n\n:::',
    });
    const replacementHead = (await app.services.office.versions(file, actor))[0]!;
    await app.services.office.restore(file, actor, priorVersion.revision, replacementHead.revision);
    const restoredRead = await execute(file, { kind: 'doc.markdown.read', blockIds: ['summary'] });
    expect((restoredRead.content as { markdown: string }).markdown).toContain('600');
    const appended = JSON.stringify(await app.services.office.snapshot(file, actor));
    expect(appended).toContain('Manual edit must survive.');
    expect(appended).toContain('SDK-generated addition.');
    expect(
      (await app.services.office.visual(file, actor, { kind: 'preview', pages: [1] })).images,
    ).toHaveLength(1);
  }, 120000);

  it('generates a paginated native Traditional document from Typst with headers, tables and history restore', async () => {
    const file = await app.services.files.create(
      actor,
      'doc',
      'Traditional SDK pages',
      null,
      'traditional',
    );
    const page =
      '#set page(paper: "a4", margin: 36pt, header: [Quarterly review], footer: [Internal])\n#set text(size: 11pt)\n';
    const evidence = Array.from(
      { length: 25 },
      (_, i) => `Observation ${i + 1}: delivery checkpoints remain visible and editable.`,
    ).join('\n\n');
    await execute(file, {
      kind: 'doc.typst',
      pages: [
        page +
          '= Quarterly report\n\nRevenue reached *523*.\n\n#table(columns: (1fr, 1fr), [Quarter], [Revenue], [Q1], [440], [Q2], [523])',
        page + evidence + '\n\n= Action plan\n\n+ Validate demand\n+ Deliver the pilot',
      ],
    });
    const original = await app.services.office.snapshot(file, actor);
    expect((original.documentStyle as { documentFlavor: number }).documentFlavor).toBe(1);
    expect(JSON.stringify(original)).toContain('Action plan');
    expect(Object.keys(original.headers as object).length).toBeGreaterThan(0);
    expect(
      Object.values(original.headers as Record<string, { body: { dataStream: string } }>).map(
        (header) => header.body.dataStream,
      ),
    ).toEqual(['Quarterly review\r\n']);
    expect(
      Object.values(original.footers as Record<string, { body: { dataStream: string } }>).map(
        (footer) => footer.body.dataStream,
      ),
    ).toEqual(['Internal\r\n']);
    const native = await execute(file, {
      kind: 'facade.read',
      calls: [
        { target: 'unit', method: 'getSections', args: [] },
        { target: 'unit', method: 'getTables', args: [] },
      ],
    });
    expect((native.content as { value: unknown[] }[])[0]!.value.length).toBeGreaterThanOrEqual(1);
    expect((native.content as { value: unknown[] }[])[1]!.value).toHaveLength(1);
    expect(
      (await app.services.office.visual(file, actor, { kind: 'preview' })).images!.length,
    ).toBeGreaterThanOrEqual(2);
    const version = (await app.services.office.versions(file, actor))[0]!;
    await execute(file, { kind: 'doc.append', text: 'Temporary later edit' });
    const head = (await app.services.office.versions(file, actor))[0]!;
    await app.services.office.restore(file, actor, version.revision, head.revision);
    const restored = JSON.stringify(await app.services.office.snapshot(file, actor));
    expect(restored).toContain('Action plan');
    expect(restored).not.toContain('Temporary later edit');
  }, 120000);

  it('rejects invalid compilation, unsafe assets and mismatched document flavors before changing content', async () => {
    const modern = await app.services.files.create(actor, 'doc', 'Safe existing content');
    await execute(modern, { kind: 'doc.append', text: 'Keep this content' });
    const before = await app.services.office.snapshot(modern, actor);
    await expect(
      execute(modern, {
        kind: 'doc.markdown',
        mode: 'replace',
        markdown: '<script>unsupported</script>',
      }),
    ).rejects.toThrow();
    await expect(
      execute(modern, {
        kind: 'doc.markdown',
        mode: 'replace',
        markdown: '::image{src="assets/../outside.svg"}',
        assets: { 'assets/../outside.svg': { data: 'bad', encoding: 'utf8' } },
      }),
    ).rejects.toThrow('safe relative');
    await expect(execute(modern, { kind: 'doc.typst', pages: ['= Wrong flavor'] })).rejects.toThrow(
      'Paged',
    );
    expect((await app.services.office.snapshot(modern, actor)).body).toEqual(before.body);
    const traditional = await app.services.files.create(
      actor,
      'doc',
      'Native pages',
      null,
      'traditional',
    );
    await expect(
      execute(traditional, { kind: 'doc.markdown', mode: 'replace', markdown: '# Wrong flavor' }),
    ).rejects.toThrow('Modern');
    await execute(traditional, { kind: 'doc.append', text: 'Keep native Traditional content.' });
    const original = await app.services.office.snapshot(traditional, actor);
    await expect(
      execute(traditional, {
        kind: 'doc.typst',
        prelude: '#set list(indent: 14pt, spacing: 0.85em)',
        pages: ['= Title'],
      }),
    ).rejects.toThrow('does not support #set list');
    await expect(
      execute(traditional, { kind: 'doc.typst', pages: ['#unknown_function()'] }),
    ).rejects.toThrow('"diagnostics"');
    expect((await app.services.office.snapshot(traditional, actor)).body).toEqual(original.body);
  }, 120000);

  it('compiles a page with real text metrics and returns real lint/PNG evidence with access checks', async () => {
    const file = await app.services.files.create(actor, 'slide', 'Native SVG');
    const result = await execute(file, {
      kind: 'slide.svg',
      page: 1,
      mode: 'replace',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"><rect width="960" height="540" fill="#F6F7FA"/><rect x="48" y="180" width="400" height="220" rx="16" fill="#FFFFFF"/><text x="48" y="100" font-family="Arial" font-size="40" fill="#242429">Quarterly review</text><text x="80" y="245" font-family="Arial" font-size="24" fill="#52525B">Revenue growth</text><text x="80" y="330" font-family="Arial" font-size="56" fill="#242429">18.86%</text></svg>',
    });
    expect(result.checked).toBe(true);
    expect(JSON.stringify(result.content)).toContain('univer-render-runtime');
    const saved = JSON.stringify(await app.services.office.snapshot(file, actor));
    expect(saved).toContain('Quarterly review');
    expect(saved).toContain('18.86%');
    const lint = await app.services.office.visual(file, actor, { kind: 'lint', pages: [1] });
    expect((lint.report as { findings: unknown[] }).findings).toEqual([]);
    const preview = await app.services.office.visual(file, actor, { kind: 'preview', pages: [1] });
    expect(preview.images).toHaveLength(1);
    const url = origin + preview.images![0]!.url;
    expect((await fetch(url)).status).toBe(401);
    const image = await fetch(url, { headers: { Cookie: cookie } });
    expect(image.status).toBe(200);
    expect(
      Buffer.from(await image.arrayBuffer())
        .subarray(1, 4)
        .toString(),
    ).toBe('PNG');
  }, 120000);

  it('keeps native spreadsheet styles, number formats and a chart across worker reloads', async () => {
    const file = await app.services.files.create(actor, 'sheet', 'Native chart');
    await execute(file, {
      kind: 'sheet.write',
      range: 'A1:B3',
      values: [
        ['Quarter', 'Revenue'],
        ['Q1', 440],
        ['Q2', 523],
      ],
    });
    const result = await execute(file, {
      kind: 'facade.write',
      calls: [
        { target: 'unit', method: 'getActiveSheet', args: [], saveAs: 'sheet' },
        { target: 'sheet', method: 'getRange', args: ['B2:B3'], saveAs: 'numbers' },
        { target: 'numbers', method: 'setNumberFormat', args: ['#,##0'] },
        {
          target: 'sheet',
          method: 'newChart',
          args: [{ enum: 'ChartTypeString.Column' }],
          saveAs: 'chart',
        },
        {
          target: 'chart',
          method: 'setSource',
          args: [{ range: 'A1:B3', orientation: { enum: 'ChartSourceOrientation.Columns' } }],
        },
        { target: 'chart', method: 'setPosition', args: ['D2'] },
        { target: 'chart', method: 'setSize', args: [480, 280] },
        { target: 'chart', method: 'setTitle', args: ['Revenue'] },
        { target: 'chart', method: 'build', args: [], saveAs: 'built' },
        { target: 'sheet', method: 'insertChart', args: [{ ref: 'built' }] },
      ],
    });
    expect(result.checked).toBe(true);
    const read = await execute(file, {
      kind: 'facade.read',
      calls: [
        { target: 'unit', method: 'getActiveSheet', args: [], saveAs: 'sheet' },
        { target: 'sheet', method: 'getCharts', args: [] },
      ],
    });
    expect((read.content as { value: unknown[] }[])[1]!.value).toHaveLength(1);
  });

  it('creates bound native Board connectors instead of disconnected text', async () => {
    const file = await app.services.files.create(actor, 'board', 'Native flow');
    const calls: Extract<OfficeAction, { kind: 'facade.write' }>['calls'] = [];
    for (const [index, label] of ['Validate', 'Deliver'].entries()) {
      calls.push(
        {
          target: 'unit',
          method: 'insertShape',
          args: [
            {
              shapeType: { enum: 'ShapeTypeEnum.RoundRect' },
              transform: { left: 80 + index * 320, top: 120, width: 220, height: 100 },
            },
          ],
          saveAs: `node${index}`,
        },
        { target: `node${index}`, method: 'setSolidFill', args: ['#F1F4FA'] },
        { target: `node${index}`, method: 'getText', args: [], saveAs: `text${index}` },
        { target: `text${index}`, method: 'setText', args: [label] },
        { target: `node${index}`, method: 'getId', args: [], saveAs: `id${index}` },
      );
    }
    calls.push({
      target: 'unit',
      method: 'insertConnector',
      args: [
        {
          fromElementId: { ref: 'id0' },
          toElementId: { ref: 'id1' },
          style: { endMarker: { type: 'filledTriangle', size: 'md' } },
        },
      ],
    });
    expect((await execute(file, { kind: 'facade.write', calls })).checked).toBe(true);
    const read = await execute(file, {
      kind: 'facade.read',
      calls: [{ target: 'unit', method: 'describeElements', args: [] }],
    });
    expect(JSON.stringify(read.content)).toContain('connector');
    expect(JSON.stringify(read.content)).toContain('Validate');
    const preview = await app.services.office.visual(file, actor, { kind: 'preview' });
    expect(preview.images).toHaveLength(1);
    expect(preview.images![0]!.layoutAnalysis).toBeDefined();
  });

  it('persists typed Base currency fields, record identity and view configuration', async () => {
    const file = await app.services.files.create(actor, 'base', 'Native schema');
    const overview = await execute(file, { kind: 'inspect' });
    const tableId = (overview.content as { tables: { id: string }[] }).tables[0]!.id;
    const configured = await execute(file, {
      kind: 'facade.write',
      calls: [
        { target: 'unit', method: 'getTableById', args: [tableId], saveAs: 'table' },
        {
          target: 'table',
          method: 'addField',
          args: ['Budget', { enum: 'BaseFieldType.Currency' }],
          saveAs: 'budget',
        },
        { target: 'budget', method: 'getId', args: [], saveAs: 'budgetId' },
        { target: 'table', method: 'getFieldByName', args: ['Name'], saveAs: 'name' },
        { target: 'name', method: 'getId', args: [], saveAs: 'nameId' },
        {
          target: 'table',
          method: 'createView',
          args: ['Budget review', { enum: 'BaseViewType.Grid' }],
        },
      ],
    });
    const ids = (configured.content as { result: { handle?: string; value: unknown }[] }).result;
    const budgetId = ids.find((value) => value.handle === 'budgetId')!.value as string;
    const nameId = ids.find((value) => value.handle === 'nameId')!.value as string;
    await execute(file, {
      kind: 'facade.write',
      calls: [
        { target: 'unit', method: 'getTableById', args: [tableId], saveAs: 'table' },
        { target: 'table', method: 'addRecord', args: [{ [nameId]: 'Pilot', [budgetId]: 6000 }] },
      ],
    });
    const saved = JSON.stringify((await execute(file, { kind: 'inspect' })).content);
    expect(saved).toContain('currency');
    expect(saved).toContain('Budget review');
    expect(saved).toContain('Pilot');
  });
});
