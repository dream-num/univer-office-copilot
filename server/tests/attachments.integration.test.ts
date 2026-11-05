import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeModel, type FakeBuiltModel } from '@langchain/core/testing';
import { AIMessage } from '@langchain/core/messages';
import {
  MAX_IMPORT_BYTES,
  runInputSchema,
  type ChatAttachment,
  type Conversation,
  type OfficeFile,
} from '@univer-copilot/shared';
import { createApplication } from '../src/bootstrap/app.ts';
import { attachmentPdf, attachmentPng } from '../../tests/fixtures/chat-files.ts';

describe('private chat uploads and real model context', () => {
  let app: Awaited<ReturnType<typeof createApplication>>, directory: string, origin: string;
  let actor: string,
    cookie: string,
    otherCookie: string,
    file: OfficeFile,
    conversation: Conversation,
    fixture: FakeBuiltModel;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'copilot-attachments-'));
    app = await createApplication({
      host: '127.0.0.1',
      port: 0,
      demo: true,
      dataDir: directory,
      modelFactory: async () => fixture,
    });
    origin = `http://127.0.0.1:${await app.start()}`;
    const response = await fetch(`${origin}/api/auth/demo`, { method: 'POST' });
    cookie = response.headers.get('set-cookie')!.split(';')[0]!;
    actor = (await response.json()).user.id;
    otherCookie = (await fetch(`${origin}/api/auth/demo`, { method: 'POST' })).headers
      .get('set-cookie')!
      .split(';')[0]!;
    file = await app.services.files.create(actor, 'sheet', 'Attachment target');
    conversation = app.services.conversations.create(actor, file.id);
  });
  afterAll(async () => {
    await app?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const request = (path: string, auth = cookie) =>
    fetch(`${origin}/api${path}`, { headers: { Cookie: auth } });
  const upload = (filename: string, bytes: Uint8Array, auth = cookie, id = conversation.id) =>
    fetch(`${origin}/api/conversations/${id}/attachments?${new URLSearchParams({ filename })}`, {
      method: 'POST',
      headers: { Cookie: auth, 'Content-Type': 'application/octet-stream' },
      body: Buffer.from(bytes),
    });
  async function saved(filename: string, bytes: Uint8Array) {
    const response = await upload(filename, bytes),
      body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(201);
    return body.attachment as ChatAttachment;
  }
  async function finish(id: string) {
    await expect
      .poll(() => app.services.copilot.get(id, actor).status, { timeout: 40000 })
      .not.toMatch(/^(queued|running)$/);
    return app.services.copilot.get(id, actor);
  }

  it('extracts actual PDF text, paginates Markdown, and downloads original bytes', async () => {
    const pdf = await saved('report.pdf', attachmentPdf());
    expect(pdf.pages).toBe(1);
    expect((await (await request(`/attachments/${pdf.id}`)).json()).text).toContain(
      'Revenue target: 128',
    );
    const noText = await saved('no-text.pdf', attachmentPdf(''));
    expect(noText.note).toContain('No text layer');
    const bytes = Buffer.from('# Brief\n\n' + 'Sales target 128.\n'.repeat(2000));
    const markdown = await saved('brief.md', bytes);
    const first = await (await request(`/attachments/${markdown.id}`)).json();
    expect(first.attachment.kind).toBe('markdown');
    expect(first.text.length).toBe(16000);
    const second = await (
      await request(`/attachments/${markdown.id}?offset=${first.nextOffset}`)
    ).json();
    expect(first.text + second.text).toBe(bytes.toString().slice(0, 32000));
    const original = await request(`/attachments/${markdown.id}/content`);
    expect(Buffer.from(await original.arrayBuffer())).toEqual(bytes);
    expect(original.headers.get('content-disposition')).toContain('attachment');
    expect(original.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('decodes real images into bounded previews and retains the original download', async () => {
    const image = await saved('chart.png', attachmentPng);
    expect(image).toMatchObject({ kind: 'image', width: 16, height: 12 });
    const preview = await request(`/attachments/${image.id}/preview`);
    expect(preview.headers.get('content-type')).toMatch(/^image\/webp/);
    expect(
      Buffer.from(await preview.arrayBuffer())
        .subarray(8, 12)
        .toString(),
    ).toBe('WEBP');
    expect(
      Buffer.from(await (await request(`/attachments/${image.id}/content`)).arrayBuffer()),
    ).toEqual(attachmentPng);
  });
  it('bounds the parser queue instead of starting unbounded workers', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, (_, index) =>
        app.services.attachments.upload(
          conversation.id,
          actor,
          Buffer.from('Bounded parser test'),
          `queued-${index}.txt`,
        ),
      ),
    );
    expect(results.slice(0, 3).every((result) => result.status === 'fulfilled')).toBe(true);
    expect(results[3]).toMatchObject({ status: 'rejected', reason: { code: 'UPLOAD_BUSY' } });
  });
  it('rejects invalid files, spoofed image formats, size/page limits and anonymous uploads', async () => {
    for (const [name, bytes, status] of [
      ['bad.pdf', Buffer.from('not a PDF'), 422],
      ['bad.png', Buffer.from('<svg/>'), 422],
      ['bad.txt', Buffer.from([255, 255]), 422],
      ['app.exe', Buffer.from('x'), 400],
      ['empty.txt', Buffer.alloc(0), 400],
      ['long.txt', Buffer.alloc(200001, 65), 422],
      ['many.pdf', attachmentPdf('Too many pages', 101), 422],
      ['large.txt', Buffer.alloc(MAX_IMPORT_BYTES + 1), 413],
    ] as const)
      expect((await upload(name, bytes)).status, name).toBe(status);
    expect((await upload('secret.txt', Buffer.from('private'), '')).status).toBe(401);
  });
  it('keeps upload bytes and metadata private, binds them to a conversation, and cascades deletion', async () => {
    const uploaded = await saved('private.txt', Buffer.from('Private reference marker'));
    for (const path of ['', '/content', '/preview'])
      expect((await request(`/attachments/${uploaded.id}${path}`, otherCookie)).status).toBe(404);
    expect((await upload('forbidden.txt', Buffer.from('x'), otherCookie)).status).toBe(404);
    const second = app.services.conversations.create(actor, file.id);
    const profile = app.services.providers.save(actor, {
      name: 'Fixture',
      provider: 'openai',
      model: 'fixture',
    });
    expect(() =>
      app.services.copilot.start(
        actor,
        runInputSchema.parse({
          conversationId: second.id,
          fileId: file.id,
          profileId: profile.id,
          apiKey: 'fixture',
          mode: 'ask',
          text: 'Read this',
          attachmentIds: [uploaded.id],
        }),
      ),
    ).toThrow('not available');
    const temporary = await (
      await upload('temporary.txt', Buffer.from('delete me'), cookie, second.id)
    ).json();
    app.services.conversations.remove(second.id, actor);
    expect((await request(`/attachments/${temporary.attachment.id}`)).status).toBe(404);
  });
  it('feeds extracted text to real LangChain tools and retains attached context for follow-up turns', async () => {
    const doc = await saved(
      'model-brief.md',
      Buffer.from('# Evidence\n\nAttachment evidence marker: 128'),
    );
    fixture = fakeModel()
      .respondWithTools([{ name: 'read_attachment', args: { id: doc.id } }])
      .respond(new AIMessage('Read the attached brief.'));
    const profile = app.services.providers.save(actor, {
      name: 'Text fixture',
      provider: 'openai',
      model: 'fixture',
    });
    const input = runInputSchema.parse({
      conversationId: conversation.id,
      fileId: file.id,
      mode: 'ask',
      text: 'Read the attached brief.',
      profileId: profile.id,
      apiKey: 'fixture',
      attachmentIds: [doc.id],
    });
    const first = app.services.copilot.start(actor, input);
    expect((await finish(first.id)).status).toBe('completed');
    expect(
      fixture.calls
        .flatMap((call) => call.messages)
        .some(
          (message) =>
            message.getType() === 'tool' &&
            JSON.stringify(message.content).includes('Attachment evidence marker: 128'),
        ),
    ).toBe(true);
    const user = app.services.conversations
      .messages(conversation.id, actor)
      .find((message) => message.runId === first.id && message.role === 'user')!;
    expect(user.attachments).toEqual([doc]);
    fixture = fakeModel()
      .respondWithTools([{ name: 'read_attachment', args: { id: doc.id } }])
      .respond(new AIMessage('The same reference is still available.'));
    const followup = app.services.copilot.start(actor, {
      ...input,
      text: 'Check that brief again.',
      attachmentIds: [],
    });
    expect((await finish(followup.id)).status).toBe('completed');
    expect(
      fixture.calls
        .flatMap((call) => call.messages)
        .some(
          (message) =>
            message.getType() === 'tool' &&
            JSON.stringify(message.content).includes('Attachment evidence marker: 128'),
        ),
    ).toBe(true);
    const link = app.services.conversations.publish(conversation.id, actor, 1);
    const published = app.services.conversations.published(link.token);
    expect(published.messages.every((message) => !('attachments' in message))).toBe(true);
    expect(JSON.stringify(published)).not.toContain(doc.id);
  });
  it('blocks incompatible models before a run and delivers actual image blocks to image-enabled models', async () => {
    const image = await saved('vision.png', attachmentPng);
    const profile = app.services.providers.save(actor, {
      name: 'Vision fixture',
      provider: 'openai',
      model: 'fixture',
      imageInput: false,
    });
    const input = runInputSchema.parse({
      conversationId: conversation.id,
      fileId: file.id,
      mode: 'ask',
      text: 'Describe this image.',
      profileId: profile.id,
      apiKey: 'fixture',
      attachmentIds: [image.id],
    });
    const before = app.services.conversations.messages(conversation.id, actor).length;
    expect(() => app.services.copilot.start(actor, input)).toThrow('image-enabled');
    expect(app.services.conversations.messages(conversation.id, actor).length).toBe(before);
    app.services.providers.save(actor, { ...profile, imageInput: true });
    fixture = fakeModel().respond(new AIMessage('Received the image.'));
    const run = app.services.copilot.start(actor, input);
    expect((await finish(run.id)).status).toBe('completed');
    const content = fixture.calls[0]!.messages.at(-1)!.content;
    expect(JSON.stringify(content)).toContain('data:image/webp;base64,');
    expect(JSON.stringify(content)).not.toContain(attachmentPng.toString('base64'));
    expect(
      runInputSchema.safeParse({
        ...input,
        attachmentIds: Array(5).fill(image.id),
        referencedFileIds: [file.id],
      }).success,
    ).toBe(false);
  });
});
