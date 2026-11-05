import { randomUUID, createHash } from 'node:crypto';
import { createMiddleware } from 'langchain';
import { HumanMessage, ToolMessage } from '@langchain/core/messages';
import { z } from 'zod';
import type { OfficeFile } from '@univer-copilot/shared';
import type { OfficeGateway, OfficeVisualResult } from '../../office/contracts.ts';
import { AppError } from '../../http/errors.ts';

export const visualTargetSchema = z.object({
  pages: z.array(z.number().int().min(1).max(100)).min(1).max(8).optional(),
  range: z.string().max(40).optional(),
  sheetName: z.string().max(150).optional(),
  elementIds: z.array(z.string().max(100)).min(1).max(100).optional(),
  region: z
    .object({
      left: z.number().min(-100000).max(100000),
      top: z.number().min(-100000).max(100000),
      width: z.number().positive().max(10000),
      height: z.number().positive().max(10000),
    })
    .optional(),
  padding: z.number().min(0).max(200).optional(),
  scale: z.number().min(0.25).max(2).optional(),
});
export const verificationSchema = z.object({
  code: z.string().min(1).max(50000),
  target: visualTargetSchema,
  intentionalWarnings: z
    .array(z.object({ id: z.string().max(300), reason: z.string().min(15).max(600) }))
    .max(30)
    .default([]),
});
type Finding = { id: string; severity: string; detail: unknown };

/** A receipt is valid only for the exact saved head that was read and rendered. */
export function createOfficeVerification(input: {
  office: OfficeGateway;
  file: OfficeFile;
  actor: string;
  runId: string;
  signal: AbortSignal;
  latestChange: () => number;
  publish: (result: OfficeVisualResult) => Promise<unknown>;
}) {
  let receipt: { head: number; change: number } | undefined;
  let reminders = 0;
  let queue: Promise<unknown> = Promise.resolve();
  return {
    async verify(args: z.infer<typeof verificationSchema>) {
      const { office, file, actor, signal } = input;
      signal.throwIfAborted();
      if ((file.type === 'doc' || file.type === 'slide') && !args.target.pages?.length)
        throw new Error('Specify every changed one-based page (up to eight per verification).');
      if (file.type === 'sheet' && !args.target.range)
        throw new Error('Specify the changed spreadsheet range to render.');
      receipt = undefined;
      const head = await office.revision(file, actor),
        change = input.latestChange();
      const readback = await office.execute(
        file,
        actor,
        input.runId,
        randomUUID(),
        { kind: 'script.verify', code: args.code },
        signal,
      );
      signal.throwIfAborted();
      if (!readback.checked) throw new Error('Native readback assertions were not confirmed.');
      const preview = await office.visual(file, actor, { ...args.target, kind: 'preview' });
      if (!preview.images?.length)
        throw new Error('The current file produced no rendered verification evidence.');
      const content = await input.publish(preview);
      const findings: Finding[] = [];
      if (file.type === 'slide') {
        const lint = await office.visual(file, actor, { kind: 'lint', pages: args.target.pages });
        const report = lint.report as
          | { findings?: { fingerprint: string; severity: string }[] }
          | undefined;
        if (!report || !Array.isArray(report.findings))
          throw new Error('Slide layout lint returned no report.');
        findings.push(
          ...report.findings.map((f) => ({ id: f.fingerprint, severity: f.severity, detail: f })),
        );
      }
      if (file.type === 'board')
        for (const image of preview.images) {
          const analysis = image.layoutAnalysis as
            | {
                issues?: { id: string; severity: string }[];
                summary?: { unresolvedConnectorCount: number };
                source?: string;
              }
            | undefined;
          if (analysis?.source !== 'rendered' || !Array.isArray(analysis.issues))
            throw new Error('Board preview returned no rendered layout analysis.');
          findings.push(
            ...analysis.issues.map((f) => ({
              id: createHash('sha256').update(JSON.stringify(f)).digest('hex'),
              severity: f.severity,
              detail: f,
            })),
          );
          if (analysis.summary?.unresolvedConnectorCount)
            throw new Error(
              'Board contains unresolved connector routes. Read rendered evidence and repair them.',
            );
        }
      const acknowledged = new Set(args.intentionalWarnings.map((f) => f.id));
      const unresolved = findings.filter((f) => f.severity === 'error' || !acknowledged.has(f.id));
      if (unresolved.length)
        throw new Error(
          `Repair these layout findings, or justify intentional warnings by their exact IDs and reasons: ${JSON.stringify(unresolved).slice(0, 14000)}`,
        );
      signal.throwIfAborted();
      if (head !== (await office.revision(file, actor)) || change !== input.latestChange())
        throw new Error(
          'The shared file changed during verification. Read the new content and verify again.',
        );
      receipt = { head, change };
      return {
        readback,
        head,
        findings,
        intentionalWarnings: args.intentionalWarnings,
        preview,
        content,
      };
    },
    middleware: createMiddleware({
      name: 'OfficeVerification',
      // LangChain may request multiple tools together; native work stays ordered per run.
      wrapToolCall: async (request, handler) => {
        const result = queue.then(async () => {
          input.signal.throwIfAborted();
          try {
            return await handler(request);
          } catch (error) {
            input.signal.throwIfAborted();
            if (
              error instanceof AppError &&
              ['STEP_LIMIT', 'VERIFICATION_REQUIRED'].includes(error.code)
            )
              throw error;
            return new ToolMessage({
              tool_call_id: request.toolCall.id!,
              name: request.toolCall.name,
              content: JSON.stringify({
                error:
                  error instanceof Error ? error.message.slice(0, 16000) : 'Office tool failed.',
                next: 'Read current saved content. Repair concrete defects; do not repeat uncertain writes blindly.',
              }),
              status: 'error',
            });
          }
        });
        queue = result.catch(() => {});
        return result;
      },
      afterModel: {
        canJumpTo: ['model'],
        hook: async (state) => {
          const last = state.messages.at(-1);
          if (
            last &&
            'tool_calls' in last &&
            Array.isArray(last.tool_calls) &&
            last.tool_calls.length
          )
            return;
          const change = input.latestChange();
          if (!change) return;
          if (
            receipt?.change === change &&
            receipt.head === (await input.office.revision(input.file, input.actor))
          )
            return;
          if (++reminders > 3)
            throw new AppError(
              422,
              'VERIFICATION_REQUIRED',
              'Edits were saved, but readback and rendered verification did not finish. Review the file and retry verification.',
            );
          return {
            messages: [
              new HumanMessage(
                'System validation: saved edits have no current verification receipt. Call office_verify with fresh native reads, assert checks for the requested results, and rendered targets covering the changed content. Fix concrete failures and verify again. Do not repeat confirmed writes. If verification is unavailable, stop with an explicit failure instead of claiming completion.',
              ),
            ],
            jumpTo: 'model' as const,
          };
        },
      },
    }),
  };
}
