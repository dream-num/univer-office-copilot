import { useEffect, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Box,
  ChevronDown,
  ChevronRight,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import {
  effectiveReasoningEffort,
  type ModelOption,
  type ModelProfile,
  type ReasoningEffort,
} from '@univer-copilot/shared';
import { loadDeepSeekModels, post } from '../../api/client.ts';
import { Button } from '../../components/button.tsx';
import {
  MenuContent,
  MenuItem,
  MenuRadioItem,
  MenuSeparator,
  MenuSubContent,
} from '../../components/menu.tsx';

const effortNames = { off: 'Off', low: 'Low', high: 'High', max: 'Max' };
const effortDescriptions = {
  off: 'Respond without thinking',
  low: 'Shorter reasoning',
  high: 'Deeper reasoning',
  max: 'Most reasoning · may take longer',
};
const displayName = (model: ModelOption) => model.name.replaceAll('-', ' ');
function tokens(value: number) {
  return value >= 1024 * 1024
    ? `${Math.round(value / 1024 / 1024)}M`
    : `${Math.round(value / 1024)}K`;
}

export function ModelPicker({
  profiles,
  keys,
  value,
  disabled,
  onChange,
  onUpdated,
  onSettings,
  onError,
}: {
  profiles: ModelProfile[];
  keys: Record<string, string>;
  value: string;
  disabled: boolean;
  onChange(value: string): void;
  onUpdated(profile: ModelProfile): void;
  onSettings(): void;
  onError(message: string): void;
}) {
  const selected = profiles.find((profile) => profile.id === value);
  const [models, setModels] = useState<ModelOption[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0),
    [saving, setSaving] = useState(false);
  const key = keys[value],
    available = !!key || !!selected?.serverKeyAvailable;
  useEffect(() => {
    setModels([]);
    setError('');
    if (selected?.provider !== 'deepseek' || !available) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void loadDeepSeekModels(key, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setModels(result.models);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Unable to load models.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selected?.id, selected?.provider, available, key, reload]);
  const current = models.find((model) => model.id === selected?.model);
  const effort = selected ? effectiveReasoningEffort(selected) : 'off';
  const label = current ? displayName(current) : (selected?.name ?? 'Choose model');
  const detail = selected?.provider === 'deepseek' ? ` · ${effortNames[effort]}` : '';
  async function choose(
    profile: ModelProfile,
    model?: ModelOption,
    reasoningEffort?: ReasoningEffort,
  ) {
    if ((!model || model.id === profile.model) && reasoningEffort === undefined) {
      onChange(profile.id);
      return;
    }
    setSaving(true);
    try {
      const nextEffort =
        reasoningEffort ??
        (effort === 'off'
          ? 'off'
          : model?.reasoningEfforts.includes(effort)
            ? effort
            : model?.defaultReasoningEffort);
      const result = await post<{ profile: ModelProfile }>('/provider-profiles', {
        ...profile,
        model: model?.id ?? profile.model,
        reasoningEffort: nextEffort,
        thinking: nextEffort ? nextEffort !== 'off' : profile.thinking,
        imageInput: model && !model.inputModalities.includes('image') ? false : profile.imageInput,
      });
      onUpdated(result.profile);
      onChange(result.profile.id);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Unable to update model.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="model-picker"
          aria-label="AI model"
          disabled={disabled || saving}
          tooltip={selected ? `${label} · ${selected.model}${detail}` : 'Choose a model'}
        >
          {saving ? (
            <LoaderCircle size={17} className="app:animate-spin" />
          ) : (
            <Box size={17} aria-hidden="true" />
          )}
          <span className="model-picker-label">
            {label}
            {detail}
          </span>
          <ChevronDown size={13} aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <MenuContent
        className="model-menu app:w-80"
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={12}
      >
        <DropdownMenu.RadioGroup value={current ? `${value}/${current.id}` : value}>
          {profiles.map((profile) => {
            const choices = profile.id === value && profile.provider === 'deepseek' ? models : [];
            return (
              <div key={profile.id}>
                {!!choices.length && (
                  <DropdownMenu.Label className="app:px-2.5 app:py-1.5 app:text-[11px] app:font-medium app:text-zinc-500">
                    {profile.name}
                  </DropdownMenu.Label>
                )}
                {choices.length ? (
                  choices.map((model) => (
                    <MenuRadioItem
                      key={model.id}
                      value={`${profile.id}/${model.id}`}
                      disabled={disabled || saving}
                      onSelect={() => void choose(profile, model)}
                      className="app:min-h-16"
                    >
                      <span className="app:grid app:min-w-0 app:gap-0.5">
                        <strong className="app:truncate app:text-[13px] app:font-medium">
                          {displayName(model)}
                        </strong>
                        <span className="app:truncate app:text-[11px] app:text-zinc-500">
                          {model.id}
                        </span>
                        <span className="app:text-[10px] app:text-zinc-500">
                          {[
                            model.contextWindow ? `${tokens(model.contextWindow)} context` : '',
                            model.inputModalities.includes('image') ? 'Image input' : 'Text input',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </MenuRadioItem>
                  ))
                ) : (
                  <MenuRadioItem
                    value={profile.id}
                    disabled={disabled || saving}
                    onSelect={() => onChange(profile.id)}
                    className="app:min-h-14"
                  >
                    <span className="app:grid app:min-w-0 app:flex-1 app:gap-0.5">
                      <strong className="app:truncate app:text-[13px] app:font-medium">
                        {profile.name}
                      </strong>
                      <span className="app:truncate app:text-[11px] app:text-zinc-500">
                        {profile.model}
                      </span>
                    </span>
                    {!keys[profile.id] && !profile.serverKeyAvailable && (
                      <KeyRound size={13} aria-label="API key required" />
                    )}
                  </MenuRadioItem>
                )}
              </div>
            );
          })}
        </DropdownMenu.RadioGroup>
        {loading && (
          <div
            role="status"
            className="app:flex app:items-center app:gap-2 app:px-2.5 app:py-2 app:text-xs app:text-zinc-500"
          >
            <LoaderCircle size={13} className="app:animate-spin" />
            Loading available models…
          </div>
        )}
        {error && (
          <MenuItem
            onSelect={(event) => {
              event.preventDefault();
              setReload((value) => value + 1);
            }}
            title={error}
          >
            <RefreshCw size={14} />
            Retry model discovery
          </MenuItem>
        )}
        {!!current?.reasoningEfforts.length && selected && (
          <>
            <MenuSeparator />
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className="app:flex app:min-h-9 app:w-full app:items-center app:gap-2 app:rounded-md app:px-2.5 app:text-zinc-600 app:outline-none app:data-[highlighted]:bg-zinc-100">
                Reasoning effort
                <span className="app:ml-auto app:text-xs app:text-zinc-500">
                  {effortNames[effort]}
                </span>
                <ChevronRight size={13} />
              </DropdownMenu.SubTrigger>
              <MenuSubContent>
                <DropdownMenu.RadioGroup value={effort}>
                  {(['off', ...current.reasoningEfforts] as ReasoningEffort[]).map((level) => (
                    <MenuRadioItem
                      key={level}
                      value={level}
                      disabled={disabled || saving}
                      onSelect={() => void choose(selected, undefined, level)}
                    >
                      <span className="app:grid app:gap-0.5">
                        <strong className="app:text-[13px] app:font-medium">
                          {effortNames[level]}
                        </strong>
                        <span className="app:text-[11px] app:text-zinc-500">
                          {effortDescriptions[level]}
                        </span>
                      </span>
                    </MenuRadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </MenuSubContent>
            </DropdownMenu.Sub>
          </>
        )}
        {!!profiles.length && <MenuSeparator />}
        <MenuItem onSelect={onSettings}>
          <Settings2 size={14} />
          {profiles.length ? 'Manage models' : 'Add model'}
        </MenuItem>
      </MenuContent>
    </DropdownMenu.Root>
  );
}
