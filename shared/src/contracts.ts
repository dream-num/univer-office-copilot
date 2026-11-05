import { z } from 'zod';

export const fileTypes = ['sheet', 'doc', 'slide', 'base', 'board'] as const;
export const fileTypeSchema = z.enum(fileTypes);
export type FileType = z.infer<typeof fileTypeSchema>;
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export type FileExportFormat = 'office' | 'native';
export const documentFlavorSchema = z.enum(['modern', 'traditional']);
export type DocumentFlavor = z.infer<typeof documentFlavorSchema>;
export const productNames: Record<FileType, string> = {
  sheet: 'Spreadsheet',
  doc: 'Document',
  slide: 'Presentation',
  base: 'Relational table',
  board: 'Canvas',
};
export const providerIds = [
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'openrouter',
  'custom',
] as const;
export const providerSchema = z.enum(providerIds);
export type ProviderId = z.infer<typeof providerSchema>;
export const modeSchema = z.enum(['ask', 'edit']);
export type Mode = z.infer<typeof modeSchema>;
export type User = { id: string; name: string; email: string };
export type FileRole = 'owner' | 'editor' | 'viewer';
export const fileEmojiSchema = z
  .string()
  .max(64)
  .regex(new RegExp('^\\p{RGI_Emoji}$', 'v'), 'Choose one emoji.')
  .refine((value) => !/^\p{Emoji_Modifier}$/u.test(value), 'Choose one complete emoji.')
  .nullable();
export type OfficeFile = {
  id: string;
  unitId: string;
  type: FileType;
  name: string;
  ownerId: string;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  role: FileRole;
  documentFlavor?: DocumentFlavor | null;
  emoji?: string | null;
};
export type Folder = { id: string; name: string; parentId: string | null };
export type Location = {
  fileId: string;
  type: FileType;
  label: string;
  sheetId?: string;
  range?: string;
  elementId?: string;
  pageId?: string;
  tableId?: string;
  paragraphId?: string;
};
export type Conversation = {
  id: string;
  fileId: string;
  title: string;
  mode: Mode;
  updatedAt: number;
  preview?: string | null;
};
export type Message = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  text: string;
  reasoning: string;
  runId: string | null;
  createdAt: number;
  attachments?: ChatAttachment[];
};
export const MAX_CHAT_ATTACHMENTS = 5;
export type ChatAttachment = {
  id: string;
  source: 'workspace' | 'upload';
  name: string;
  kind: FileType | 'pdf' | 'image' | 'markdown' | 'text';
  size?: number;
  documentFlavor?: DocumentFlavor | null;
  emoji?: string | null;
  pages?: number;
  width?: number;
  height?: number;
  note?: string;
};
export const reasoningEffortSchema = z.enum(['off', 'low', 'high', 'max']);
export type ReasoningEffort = z.infer<typeof reasoningEffortSchema>;
export type ModelOption = {
  id: string;
  name: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputModalities: ('text' | 'image')[];
  reasoningEfforts: Exclude<ReasoningEffort, 'off'>[];
  defaultReasoningEffort?: Exclude<ReasoningEffort, 'off'>;
};
export const modelProfileSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(80),
    provider: providerSchema,
    model: z.string().trim().min(1).max(150),
    baseUrl: z.url().optional(),
    thinking: z.boolean().default(false),
    reasoningEffort: reasoningEffortSchema.optional(),
    imageInput: z.boolean().optional(),
  })
  .refine((profile) => profile.reasoningEffort === undefined || profile.provider === 'deepseek', {
    message: 'Explicit reasoning levels are currently supported for DeepSeek profiles.',
    path: ['reasoningEffort'],
  });
export type ModelProfile = z.infer<typeof modelProfileSchema> & {
  id: string;
  serverKeyAvailable?: boolean;
};
export function effectiveReasoningEffort(
  profile: Pick<ModelProfile, 'reasoningEffort' | 'thinking'>,
): ReasoningEffort {
  return profile.reasoningEffort ?? (profile.thinking ? 'high' : 'off');
}
export const runInputSchema = z
  .object({
    conversationId: z.string().min(1),
    fileId: z.string().min(1),
    mode: modeSchema,
    text: z.string().trim().min(1).max(16000),
    profileId: z.string().min(1),
    apiKey: z.string().min(1).max(4096).optional(),
    referencedFileIds: z.array(z.string()).max(5).default([]),
    attachmentIds: z.array(z.string()).max(MAX_CHAT_ATTACHMENTS).default([]),
    selection: z
      .object({
        sheetId: z.string().optional(),
        range: z.string().max(100).optional(),
        elementId: z.string().optional(),
        paragraphId: z.string().optional(),
      })
      .optional(),
  })
  .refine(
    (value) => value.referencedFileIds.length + value.attachmentIds.length <= MAX_CHAT_ATTACHMENTS,
    'Attach up to five files.',
  );
export type RunInput = z.infer<typeof runInputSchema>;
export const runStatuses = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
] as const;
export type RunStatus = (typeof runStatuses)[number];
export type Run = {
  id: string;
  conversationId: string;
  fileId: string;
  status: RunStatus;
  createdAt: number;
  error: string | null;
};
export type RunChange = {
  id: string;
  runId: string;
  fileId: string;
  operationId: string;
  revision: number;
  changesetId: string;
  summary: string;
  location: Location | null;
  checked: boolean;
};
export const runEventSchema = z.object({
  runId: z.string(),
  seq: z.number().int(),
  at: z.number(),
  type: z.enum([
    'run.started',
    'text.delta',
    'reasoning.delta',
    'tool.started',
    'tool.completed',
    'tool.failed',
    'content.committed',
    'content.checked',
    'preview.created',
    'run.completed',
    'run.failed',
    'run.cancelled',
    'run.interrupted',
  ]),
  data: z.object({
    text: z.string().optional(),
    name: z.string().optional(),
    operationId: z.string().optional(),
    revision: z.number().optional(),
    changesetId: z.string().optional(),
    summary: z.string().optional(),
    checked: z.boolean().optional(),
    images: z
      .array(
        z.object({
          url: z.string(),
          width: z.number(),
          height: z.number(),
          page: z.number().optional(),
        }),
      )
      .optional(),
  }),
});
export type RunEvent = z.infer<typeof runEventSchema>;
export type FileVersion = {
  id: string;
  revision: number;
  at: number;
  actor: string;
  actorId: string;
  source: 'user' | 'ai' | 'restore';
  summary: string;
};
export type ShareLink = { id: string; url: string; expiresAt: number; revoked: boolean };

const cellValue = z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()]);
const facadeCallSchema = z.object({
  target: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9]*$/)
    .max(50),
  method: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9]*$/)
    .max(100),
  args: z.array(z.json()).max(20).default([]),
  saveAs: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9]*$/)
    .max(50)
    .optional(),
});
export const facadeReadSchema = z.object({
  kind: z.literal('facade.read'),
  calls: z.array(facadeCallSchema).min(1).max(80),
});
const documentAssetsSchema = z.record(
  z.string().max(160),
  z.object({
    data: z.string().max(1400000),
    encoding: z.enum(['utf8', 'base64']).default('utf8'),
    mimeType: z.string().max(100).optional(),
  }),
);
const markdownReadSchema = z.object({
  kind: z.literal('doc.markdown.read'),
  blockIds: z.array(z.string().min(1).max(120)).min(1).max(50).optional(),
});
const scriptReadSchema = z.object({
  kind: z.literal('script.read'),
  code: z.string().min(1).max(50000),
});
const scriptVerifySchema = z.object({
  kind: z.literal('script.verify'),
  code: z.string().min(1).max(50000),
});
export const officeActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inspect') }),
  z.object({
    kind: z.literal('sheet.read'),
    sheetId: z.string().optional(),
    range: z.string().min(1).max(40),
  }),
  z.object({
    kind: z.literal('sheet.write'),
    sheetId: z.string().optional(),
    range: z.string().min(1).max(40),
    values: z.array(z.array(cellValue).min(1).max(100)).min(1).max(100),
  }),
  z.object({
    kind: z.literal('sheet.format'),
    sheetId: z.string().optional(),
    range: z.string().min(1).max(40),
    bold: z.boolean().optional(),
    background: z
      .string()
      .regex(/^#[\da-f]{6}$/i)
      .optional(),
  }),
  z.object({ kind: z.literal('doc.append'), text: z.string().min(1).max(12000) }),
  z.object({
    kind: z.literal('doc.replace'),
    paragraphId: z.string().min(1),
    text: z.string().max(12000),
  }),
  z.object({
    kind: z.literal('slide.add'),
    title: z.string().max(200),
    body: z.string().max(6000),
  }),
  z.object({
    kind: z.literal('base.add'),
    tableId: z.string().optional(),
    values: z.record(z.string(), cellValue),
  }),
  z.object({
    kind: z.literal('board.text'),
    text: z.string().min(1).max(5000),
    x: z.number().min(-10000).max(10000).default(100),
    y: z.number().min(-10000).max(10000).default(100),
  }),
  z.object({
    kind: z.literal('doc.markdown'),
    markdown: z.string().min(1).max(50000),
    mode: z.enum(['append', 'replace']),
    blockIds: z.array(z.string().min(1).max(120)).min(1).max(50).optional(),
    assets: documentAssetsSchema.optional(),
  }),
  markdownReadSchema,
  z.object({
    kind: z.literal('doc.typst'),
    pages: z.array(z.string().min(1).max(50000)).min(1).max(8),
    prelude: z.string().max(30000).optional(),
    assets: documentAssetsSchema.optional(),
  }),
  z.object({
    kind: z.literal('slide.svg'),
    svg: z.string().min(1).max(100000),
    page: z.number().int().min(1).max(30),
    mode: z.enum(['replace', 'add']).default('replace'),
  }),
  facadeReadSchema,
  z.object({
    kind: z.literal('facade.write'),
    calls: z.array(facadeCallSchema).min(1).max(80),
  }),
  scriptReadSchema,
  scriptVerifySchema,
  z.object({ kind: z.literal('script.write'), code: z.string().min(1).max(50000) }),
]);
export type OfficeAction = z.infer<typeof officeActionSchema>;
export const readOfficeActionSchema = z.discriminatedUnion('kind', [
  officeActionSchema.options[0],
  officeActionSchema.options[1],
  facadeReadSchema,
  markdownReadSchema,
  scriptReadSchema,
  scriptVerifySchema,
]);
export function isReadAction(action: { kind: string }): boolean {
  return [
    'inspect',
    'sheet.read',
    'facade.read',
    'doc.markdown.read',
    'script.read',
    'script.verify',
  ].includes(action.kind);
}
