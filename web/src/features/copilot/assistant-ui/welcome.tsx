import { ThreadPrimitive, useAuiState } from '@assistant-ui/react';
import { ArrowUpRight, KeyRound } from 'lucide-react';
import type { FileType } from '@univer-copilot/shared';
import { Button } from '../../../components/button.tsx';

const examples: Record<FileType, { label: string; prompt: string }[]> = {
  sheet: [
    {
      label: 'Create a monthly budget',
      prompt:
        'Create a simple monthly budget with six expense categories, sample amounts, and formulas for the total and remaining balance. Format it clearly.',
    },
    {
      label: 'Build a sales summary',
      prompt:
        'Build a small quarterly sales example for three regions. Add totals, growth formulas, and a chart comparing the regions.',
    },
  ],
  doc: [
    {
      label: 'Draft a project brief',
      prompt:
        'Draft a concise project brief for a website redesign, with a goal, scope, milestones, and a small responsibilities table. Use sample details I can edit.',
    },
    {
      label: 'Make a meeting agenda',
      prompt:
        'Create a clear 30-minute project kickoff agenda, including time slots, discussion topics, and an action-items section.',
    },
  ],
  slide: [
    {
      label: 'Create a three-slide pitch',
      prompt:
        'Create a three-slide pitch for a fictional neighborhood coffee shop: the idea, the customer experience, and next steps. Use a consistent modern layout with editable content.',
    },
    {
      label: 'Present a project update',
      prompt:
        'Create a concise three-slide project update with sample progress metrics, a milestones overview, and the next three actions.',
    },
  ],
  base: [
    {
      label: 'Build a project tracker',
      prompt:
        'Build a simple project tracker with task, owner, status, due date, and priority fields. Add five sample tasks and a Kanban view grouped by status.',
    },
    {
      label: 'Organize a content calendar',
      prompt:
        'Create a small content calendar with title, channel, owner, publish date, and status fields. Add five editable sample entries.',
    },
  ],
  board: [
    {
      label: 'Map a simple workflow',
      prompt:
        'Create a simple product-delivery workflow with four labeled steps, owners, and connected arrows, including one review decision.',
    },
    {
      label: 'Plan a product launch',
      prompt:
        'Create a clear product-launch planning canvas with three sections: preparation, launch day, and follow-up. Add a few sample tasks and connect the main milestones.',
    },
  ],
};

export function ChatWelcome({
  type,
  canEdit,
  disabled,
  setupLabel,
  onSettings,
  onExample,
}: {
  type: FileType;
  canEdit: boolean;
  disabled: boolean;
  setupLabel?: string;
  onSettings(): void;
  onExample(): void;
}) {
  const hasDraft = useAuiState((state) => state.composer.text.trim().length > 0);
  if (hasDraft) return null;
  const suggestions = canEdit
    ? examples[type]
    : [
        {
          label: 'Summarize this file',
          prompt:
            'Read this file and summarize its contents and main takeaways without changing it.',
        },
        {
          label: 'Explain its structure',
          prompt:
            'Explain how this file is organized and what its main sections contain. Do not change it.',
        },
      ];
  return (
    <div className="copilot-welcome">
      <h2>Start something useful</h2>
      <p>Try an example, then make it your own.</p>
      <div className="welcome-examples">
        {suggestions.map(({ label, prompt }) => (
          <ThreadPrimitive.Suggestion
            key={label}
            prompt={prompt}
            send={false}
            clearComposer={false}
            asChild
          >
            <Button
              variant="ghost"
              className="welcome-example"
              disabled={disabled}
              onClick={onExample}
              tooltip={canEdit ? 'Fill a prompt in Edit mode' : 'Fill a prompt in Ask mode'}
            >
              <span>{label}</span>
              <ArrowUpRight size={15} aria-hidden="true" />
            </Button>
          </ThreadPrimitive.Suggestion>
        ))}
      </div>
      {setupLabel && (
        <Button
          variant="ghost"
          size="sm"
          className="welcome-model"
          onClick={onSettings}
          disabled={disabled}
        >
          <KeyRound size={14} aria-hidden="true" />
          {setupLabel}
        </Button>
      )}
    </div>
  );
}
