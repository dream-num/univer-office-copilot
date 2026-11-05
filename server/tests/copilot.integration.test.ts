import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeModel } from '@langchain/core/testing';
import { AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createApplication } from '../src/bootstrap/app.ts';
import { runInputSchema } from '@univer-copilot/shared';

describe('Copilot through real LangChain and Office SDK', () => {
  let application: Awaited<ReturnType<typeof createApplication>>, directory: string, actor: string;
  let fixture: BaseChatModel;
  const key = 'fixture-key-must-never-persist';
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'copilot-agent-test-'));
    application = await createApplication({
      host: '127.0.0.1',
      port: 0,
      demo: true,
      dataDir: directory,
      modelFactory: async () => fixture,
    });
    const port = await application.start();
    actor = (
      (await (
        await fetch(`http://127.0.0.1:${port}/api/auth/demo`, { method: 'POST' })
      ).json()) as { user: { id: string } }
    ).user.id;
  });
  afterAll(async () => {
    await application?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  async function finish(id: string) {
    await expect
      .poll(() => application.services.copilot.get(id, actor).status, {
        timeout: 40000,
        interval: 100,
      })
      .not.toMatch(/^(queued|running)$/);
    return application.services.copilot.get(id, actor);
  }
  it('records actual revisions, publishes a frozen conversation, and excludes the key', async () => {
    fixture = fakeModel()
      .respondWithTools([{ name: 'office', args: { action: { kind: 'inspect' } } }])
      .respondWithTools([
        {
          name: 'office',
          args: {
            action: { kind: 'sheet.write', range: 'A1:B1', values: [['Agent wrote this', 123]] },
          },
        },
      ])
      .respond(new AIMessage('Unverified response must never appear.'))
      .respondWithTools([
        {
          name: 'office_verify',
          args: {
            code: "const values=workbook.getActiveSheet().getRange('A1:B1').getRawValues();assert(values[0][0]==='Agent wrote this'&&values[0][1]===123,'Saved row differs');return values;",
            target: { range: 'A1:C3' },
          },
        },
      ])
      .respond(new AIMessage('Saved the requested row.'));
    const { files, conversations, providers, copilot, office } = application.services;
    const file = await files.create(actor, 'sheet', 'Agent test');
    const conversation = conversations.create(actor, file.id);
    const profile = providers.save(actor, {
      name: 'Fixture',
      provider: 'openai',
      model: 'fixture',
      apiKey: key,
    });
    const input = runInputSchema.parse({
      conversationId: conversation.id,
      fileId: file.id,
      mode: 'edit',
      text: 'Write a label and a value.',
      profileId: profile.id,
      apiKey: key,
    });
    const run = copilot.start(actor, input);
    expect((await finish(run.id)).status).toBe('completed');
    expect(JSON.stringify(copilot.events(run.id, actor))).not.toContain('Unverified response');
    const changes = copilot.changes(run.id, actor);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.every((c) => c.revision > 1 && c.checked && c.location?.range === 'A1:B1')).toBe(
      true,
    );
    const read = await office.execute(
      file,
      actor,
      'read-test',
      'read-test',
      { kind: 'sheet.read', range: 'A1:B1' },
      AbortSignal.timeout(30000),
    );
    expect(read.content).toEqual([['Agent wrote this', 123]]);
    expect(conversations.messages(conversation.id, actor).at(-1)?.text).toContain(
      'Saved the requested row.',
    );
    const share = conversations.publish(conversation.id, actor, 24);
    conversations.append(conversation.id, actor, 'user', 'Private later message', run.id);
    const published = conversations.published(share.token);
    expect(JSON.stringify(published)).not.toContain('Private later message');
    expect(JSON.stringify(published)).toContain('Updated Sheet1!A1:B1');
    for (const table of [
      'profiles',
      'messages',
      'runs',
      'run_events',
      'run_changes',
      'operations',
      'conversation_links',
    ]) {
      expect(JSON.stringify(application.db.prepare(`SELECT * FROM ${table}`).all())).not.toContain(
        key,
      );
    }
    expect((await readFile(join(directory, 'application.sqlite'))).includes(Buffer.from(key))).toBe(
      false,
    );
  });
  it('repairs failed native assertions before completing and keeps both saved states', async () => {
    const { files, conversations, providers, copilot, office } = application.services;
    const file = await files.create(actor, 'sheet', 'Script repair');
    const conversation = conversations.create(actor, file.id);
    const profile = providers.save(actor, {
      name: 'Repair fixture',
      provider: 'openai',
      model: 'fixture',
    });
    const write = (value: number) => ({
      name: 'office',
      args: {
        action: {
          kind: 'script.write',
          code: `await workbook.getActiveSheet().getRange('A1').setValues([[${value}]]);`,
        },
      },
    });
    const verify = {
      name: 'office_verify',
      args: {
        code: "const values=workbook.getActiveSheet().getRange('A1').getRawValues();assert(values[0][0]===42,'Expected 42');return values;",
        target: { range: 'A1:C3' },
      },
    };
    fixture = fakeModel()
      .respondWithTools([write(41)])
      .respondWithTools([verify])
      .respondWithTools([write(42)])
      .respondWithTools([verify])
      .respond(new AIMessage('Verified 42.'));
    const run = copilot.start(
      actor,
      runInputSchema.parse({
        conversationId: conversation.id,
        fileId: file.id,
        mode: 'edit',
        text: 'Set the verified value.',
        profileId: profile.id,
        apiKey: key,
      }),
    );
    expect((await finish(run.id)).status).toBe('completed');
    expect(
      copilot
        .events(run.id, actor)
        .some((e) => e.type === 'tool.failed' && e.data.name === 'office_verify'),
    ).toBe(true);
    expect(copilot.changes(run.id, actor).every((c) => c.checked)).toBe(true);
    const versions = await office.versions(file, actor);
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const firstChange = copilot.changes(run.id, actor)[0]!;
    const previous = (await office.preview(file, actor, firstChange.revision)) as { data: unknown };
    expect(JSON.stringify(previous.data)).toContain('"v":41');
    expect(JSON.stringify(await office.snapshot(file, actor))).toContain('"v":42');
  });
  it('Ask mode rejects a write tool call without changing the file', async () => {
    fixture = fakeModel()
      .respondWithTools([
        {
          name: 'office',
          args: { action: { kind: 'sheet.write', range: 'A1', values: [['forbidden']] } },
        },
      ])
      .respond(new AIMessage('Ask mode cannot edit this file.'));
    const { files, conversations, providers, copilot, office } = application.services;
    const file = await files.create(actor, 'sheet', 'Ask test'),
      conversation = conversations.create(actor, file.id);
    const profile = providers.save(actor, {
      name: 'Fixture ask',
      provider: 'openai',
      model: 'fixture',
    });
    const run = copilot.start(
      actor,
      runInputSchema.parse({
        conversationId: conversation.id,
        fileId: file.id,
        mode: 'ask',
        text: 'Try to write.',
        profileId: profile.id,
        apiKey: key,
      }),
    );
    await finish(run.id);
    expect(copilot.changes(run.id, actor)).toHaveLength(0);
    expect(await office.inspect(file, actor)).toMatchObject({ revision: 1 });
  });
  it('keeps confirmed edits when a later model step is cancelled', async () => {
    const { files, conversations, providers, copilot, office } = application.services;
    const file = await files.create(actor, 'sheet', 'Cancellation test'),
      conversation = conversations.create(actor, file.id);
    const profile = providers.save(actor, {
      name: 'Fixture cancellation',
      provider: 'openai',
      model: 'fixture',
    });
    let runId = '';
    fixture = fakeModel()
      .respondWithTools([
        {
          name: 'office',
          args: { action: { kind: 'sheet.write', range: 'A1', values: [['Keep confirmed edit']] } },
        },
      ])
      .respond(() => {
        copilot.cancel(runId, actor);
        return new AIMessage('Cancelled later step');
      });
    runId = copilot.start(
      actor,
      runInputSchema.parse({
        conversationId: conversation.id,
        fileId: file.id,
        mode: 'edit',
        text: 'Write then stop.',
        profileId: profile.id,
        apiKey: key,
      }),
    ).id;
    expect((await finish(runId)).status).toBe('cancelled');
    expect(copilot.changes(runId, actor).length).toBeGreaterThan(0);
    const saved = await office.execute(
      file,
      actor,
      'read-after-cancel',
      'read-after-cancel',
      { kind: 'sheet.read', range: 'A1' },
      AbortSignal.timeout(30000),
    );
    expect(saved.content).toEqual([['Keep confirmed edit']]);
  });
});
