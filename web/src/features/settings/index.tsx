import { useEffect, useState } from 'react';
import { Check, Info, KeyRound, RefreshCw } from 'lucide-react';
import {
  effectiveReasoningEffort,
  providerIds,
  type ModelOption,
  type ModelProfile,
  type ProviderId,
  type ReasoningEffort,
} from '@univer-copilot/shared';
import { api, post, loadDeepSeekModels } from '../../api/client.ts';
import { Dialog } from '../../components/dialog.tsx';
import { Input, Field, Checkbox } from '../../components/input.tsx';
import { Select } from '../../components/select.tsx';
import { Button } from '../../components/button.tsx';

const names: Record<ProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google Gemini',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
  custom: 'OpenAI-compatible',
};
export function ModelSettings({
  open,
  onClose,
  profiles,
  keys,
  onSaved,
  onKey,
}: {
  open: boolean;
  onClose(): void;
  profiles: ModelProfile[];
  keys: Record<string, string>;
  onSaved(profile: ModelProfile): void;
  onKey(id: string, value: string): void;
}) {
  const [selected, setSelected] = useState('new'),
    [provider, setProvider] = useState<ProviderId>('openai'),
    [name, setName] = useState(''),
    [model, setModel] = useState(''),
    [baseUrl, setBaseUrl] = useState(''),
    [key, setKey] = useState(''),
    [thinking, setThinking] = useState(false),
    [effort, setEffort] = useState<ReasoningEffort>('high'),
    [models, setModels] = useState<ModelOption[]>([]),
    [manualModel, setManualModel] = useState(false),
    [imageInput, setImageInput] = useState(false),
    [notice, setNotice] = useState(''),
    [noticeError, setNoticeError] = useState(false),
    [busy, setBusy] = useState(false);
  const serverKeyAvailable =
    provider === 'deepseek' &&
    profiles.some((profile) => profile.provider === 'deepseek' && profile.serverKeyAvailable);
  useEffect(() => {
    const profile = profiles.find((p) => p.id === selected);
    setProvider(profile?.provider ?? 'openai');
    setName(profile?.name ?? '');
    setModel(profile?.model ?? '');
    setBaseUrl(profile?.baseUrl ?? '');
    setThinking(profile?.thinking ?? false);
    setEffort(profile ? effectiveReasoningEffort(profile) : 'high');
    setModels([]);
    setManualModel(false);
    setImageInput(profile?.imageInput ?? false);
    setKey(profile ? (keys[profile.id] ?? '') : '');
  }, [selected, open]);
  useEffect(() => {
    if (open) setNotice('');
  }, [open]);
  async function save(test = false) {
    setBusy(true);
    setNotice('');
    setNoticeError(false);
    try {
      const { profile } = await post<{ profile: ModelProfile }>('/provider-profiles', {
        id: selected === 'new' ? undefined : selected,
        provider,
        name: name || model,
        model,
        thinking: provider === 'deepseek' ? effort !== 'off' : thinking,
        reasoningEffort: provider === 'deepseek' ? effort : undefined,
        imageInput,
        baseUrl: provider === 'custom' ? baseUrl : undefined,
      });
      onKey(profile.id, key);
      onSaved(profile);
      setSelected(profile.id);
      if (test) {
        const result = await post<{
          authentication: boolean;
          text: boolean;
          tools: string;
          reasoning: string;
        }>('/providers/test', { profileId: profile.id, apiKey: key || undefined });
        setNotice(
          `Connected. Text: ${result.text ? 'available' : 'unavailable'}. Tool calling and reasoning require a separate run.`,
        );
      } else
        setNotice(
          !key && profile.serverKeyAvailable
            ? 'Configuration saved. Using the local server key.'
            : 'Configuration saved. The key stays in this page only.',
        );
    } catch (error) {
      setNoticeError(true);
      setNotice(error instanceof Error ? error.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Your AI models" open={open} onClose={onClose}>
      <div className="app:grid app:grid-cols-1 app:gap-4 app:sm:grid-cols-2">
        <Field className="app:sm:col-span-2">
          Configuration
          <Select
            label="Configuration"
            value={selected}
            onValueChange={(value) => {
              setSelected(value);
              setNotice('');
            }}
            options={[
              { value: 'new', label: 'Add a model…' },
              ...profiles.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </Field>
        <Field>
          Provider
          <Select
            label="Provider"
            value={provider}
            onValueChange={(value) => {
              setProvider(value as ProviderId);
              setModels([]);
              setManualModel(false);
            }}
            options={providerIds.map((id) => ({ value: id, label: names[id] }))}
          />
        </Field>
        <Field>
          Configuration name
          <Input
            aria-label="Configuration name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="app:sm:col-span-2 app:flex app:flex-col app:gap-2 app:text-xs app:font-medium">
          <span className="app:flex app:items-center app:justify-between">
            Model ID
            {provider === 'deepseek' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || (!key && !serverKeyAvailable)}
                onClick={async () => {
                  setBusy(true);
                  setNotice('');
                  try {
                    const result = await loadDeepSeekModels(key);
                    setModels(result.models);
                    setManualModel(!result.models.some((item) => item.id === model));
                  } catch (cause) {
                    setNoticeError(true);
                    setNotice(cause instanceof Error ? cause.message : 'Unable to load models.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <RefreshCw size={13} />
                Find models
              </Button>
            )}
          </span>
          {provider === 'deepseek' && models.length > 0 && (
            <Select
              label="Available models"
              value={manualModel ? 'custom' : model}
              onValueChange={(value) => {
                setManualModel(value === 'custom');
                if (value === 'custom') return;
                setModel(value);
                const selectedModel = models.find((item) => item.id === value);
                if (
                  selectedModel &&
                  effort !== 'off' &&
                  !selectedModel.reasoningEfforts.includes(effort)
                )
                  setEffort(selectedModel.defaultReasoningEffort ?? 'off');
                if (!selectedModel?.inputModalities.includes('image')) setImageInput(false);
              }}
              options={[
                ...models.map((item) => ({
                  value: item.id,
                  label: item.name.replaceAll('-', ' '),
                })),
                { value: 'custom', label: 'Custom model ID…' },
              ]}
            />
          )}
          {(provider !== 'deepseek' || models.length === 0 || manualModel) && (
            <Input aria-label="Model ID" value={model} onChange={(e) => setModel(e.target.value)} />
          )}
        </div>
        {provider === 'custom' && (
          <Field className="app:sm:col-span-2">
            API base URL
            <Input
              aria-label="API base URL"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
            />
          </Field>
        )}
        <Field className="app:sm:col-span-2">
          <span className="app-field-label">
            <KeyRound size={14} /> API key
          </span>
          <Input
            aria-label="API key"
            type="password"
            value={key}
            placeholder={
              serverKeyAvailable ? 'Local server key configured · optional override' : undefined
            }
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
          />
        </Field>
        {provider === 'deepseek' && (
          <Field className="app:sm:col-span-2">
            Reasoning effort
            <Select
              label="Reasoning effort"
              value={effort}
              onValueChange={(value) => setEffort(value as ReasoningEffort)}
              options={[
                { value: 'off', label: 'Off · No thinking' },
                { value: 'low', label: 'Low · Shorter reasoning' },
                { value: 'high', label: 'High · Deeper reasoning' },
                { value: 'max', label: 'Max · Most reasoning' },
              ]}
            />
          </Field>
        )}
        {['openai', 'anthropic', 'google'].includes(provider) && (
          <Field className="checkbox-label app:sm:col-span-2">
            <Checkbox checked={thinking} onChange={(e) => setThinking(e.target.checked)} /> Request
            reasoning when supported
          </Field>
        )}
        <Field className="checkbox-label app:sm:col-span-2">
          <Checkbox checked={imageInput} onChange={(e) => setImageInput(e.target.checked)} />
          <span>
            Enable image input
            <small className="app-small">
              Send attached images and Office previews. The model must support images.
            </small>
          </span>
        </Field>
        {notice && (
          <p
            className={`${noticeError ? 'form-error' : 'form-notice'} app:sm:col-span-2`}
            role={noticeError ? 'alert' : 'status'}
          >
            {notice}
          </p>
        )}
        <div className="dialog-actions app:sm:col-span-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="app:mr-auto"
            aria-label="How API keys are used"
            tooltip={
              serverKeyAvailable
                ? 'The local server key is never returned to the browser. A key entered here overrides it for this page until reload.'
                : 'Keys entered here stay in this page until reload. Requests pass through your server to the provider; keys are never saved or shared.'
            }
          >
            <Info size={16} />
          </Button>
          <Button
            disabled={busy || !model || (!key && !serverKeyAvailable)}
            variant="secondary"
            onClick={() => void save(true)}
          >
            Test connection
          </Button>
          <Button disabled={busy || !model} onClick={() => void save()}>
            <Check size={15} /> Save configuration
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
export async function loadProfiles() {
  return (await api<{ profiles: ModelProfile[] }>('/provider-profiles')).profiles;
}
