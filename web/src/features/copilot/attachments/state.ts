import { useEffect, useRef, useState } from 'react';
import {
  MAX_CHAT_ATTACHMENTS,
  MAX_IMPORT_BYTES,
  type ChatAttachment,
  type OfficeFile,
} from '@univer-copilot/shared';
import { upload } from '../../../api/client.ts';

export const attachmentAccept =
  '.xlsx,.xls,.csv,.tsv,.docx,.pptx,.univer.json,.pdf,.png,.jpg,.jpeg,.webp,.gif,.md,.markdown,.txt';
const officeExtension = /\.(xlsx|xls|csv|tsv|docx|pptx|univer\.json)$/i;
const supportedExtension =
  /\.(xlsx|xls|csv|tsv|docx|pptx|univer\.json|pdf|png|jpe?g|webp|gif|md|markdown|txt)$/i;
export type DraftAttachment = {
  key: string;
  name: string;
  file?: File;
  attachment?: ChatAttachment;
  phase: 'queued' | 'uploading' | 'processing' | 'ready' | 'error';
  progress?: number;
  error?: string;
};
export function workspaceAttachment(file: OfficeFile): ChatAttachment {
  return {
    id: file.id,
    source: 'workspace',
    name: file.name,
    kind: file.type,
    documentFlavor: file.documentFlavor,
    emoji: file.emoji,
  };
}
export function useAttachments(
  conversationId: string | undefined,
  onImported: () => Promise<void>,
  onError: (message: string) => void,
) {
  const [all, setAll] = useState<Record<string, DraftAttachment[]>>({});
  const [notice, setNotice] = useState('');
  const current = useRef(all),
    queue = useRef(Promise.resolve()),
    mounted = useRef(true),
    controllers = useRef(new Set<AbortController>());
  const callbacks = useRef({ onImported, onError });
  callbacks.current = { onImported, onError };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const controller of controllers.current) controller.abort();
    };
  }, []);
  useEffect(() => setNotice(''), [conversationId]);
  function update(id: string, change: (items: DraftAttachment[]) => DraftAttachment[]) {
    if (!mounted.current) return;
    const next = { ...current.current, [id]: change(current.current[id] ?? []) };
    current.current = next;
    setAll(next);
  }
  function process(id: string, item: DraftAttachment) {
    queue.current = queue.current.then(async () => {
      if (
        !mounted.current ||
        !current.current[id]?.some((value) => value.key === item.key && value.phase === 'queued')
      )
        return;
      const controller = new AbortController();
      controllers.current.add(controller);
      const patch = (value: Partial<DraftAttachment>) =>
        update(id, (items) =>
          items.map((old) => (old.key === item.key ? { ...old, ...value } : old)),
        );
      patch({ phase: 'uploading', progress: 0, error: undefined });
      try {
        const file = item.file!;
        const options = {
          signal: controller.signal,
          onProgress: (progress: number) => patch({ progress }),
          onProcessing: () => patch({ phase: 'processing' }),
        };
        let attachment: ChatAttachment;
        if (officeExtension.test(file.name)) {
          const result = await upload<{ file: OfficeFile }>(
            `/files/import?${new URLSearchParams({ filename: file.name })}`,
            file,
            options,
          );
          attachment = workspaceAttachment(result.file);
          void callbacks.current
            .onImported()
            .catch((cause) =>
              callbacks.current.onError(
                cause instanceof Error
                  ? cause.message
                  : 'Refresh the workspace to see the imported file.',
              ),
            );
        } else {
          const result = await upload<{ attachment: ChatAttachment }>(
            `/conversations/${id}/attachments?${new URLSearchParams({ filename: file.name })}`,
            file,
            options,
          );
          attachment = result.attachment;
        }
        patch({ phase: 'ready', attachment, progress: undefined });
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === 'AbortError'))
          patch({
            phase: 'error',
            error: cause instanceof Error ? cause.message : 'Upload failed. Try again.',
          });
      } finally {
        controllers.current.delete(controller);
      }
    });
  }
  function addFiles(files: File[]) {
    if (!conversationId) return;
    setNotice('');
    for (const file of files) {
      const items = current.current[conversationId] ?? [];
      if (
        items.some(
          (item) =>
            item.file?.name === file.name &&
            item.file.size === file.size &&
            item.file.lastModified === file.lastModified,
        )
      )
        continue;
      if (items.length >= MAX_CHAT_ATTACHMENTS) {
        setNotice('Attach up to five files. Remove one to add another.');
        break;
      }
      if (!supportedExtension.test(file.name)) {
        setNotice(`${file.name}: this file type is not supported.`);
        continue;
      }
      if (!file.size || file.size > MAX_IMPORT_BYTES) {
        setNotice(`${file.name}: choose a non-empty file up to 20 MB.`);
        continue;
      }
      const item: DraftAttachment = {
        key: crypto.randomUUID(),
        name: file.name,
        file,
        phase: 'queued',
      };
      update(conversationId, (old) => [...old, item]);
      process(conversationId, item);
    }
  }
  function toggleWorkspace(file: OfficeFile) {
    if (!conversationId) return;
    const items = current.current[conversationId] ?? [];
    const selected = items.find(
      (item) => item.attachment?.source === 'workspace' && item.attachment.id === file.id,
    );
    if (selected) update(conversationId, (old) => old.filter((item) => item.key !== selected.key));
    else if (items.length < MAX_CHAT_ATTACHMENTS)
      update(conversationId, (old) => [
        ...old,
        {
          key: crypto.randomUUID(),
          name: file.name,
          phase: 'ready',
          attachment: workspaceAttachment(file),
        },
      ]);
    else setNotice('Attach up to five files. Remove one to add another.');
  }
  const items = all[conversationId ?? ''] ?? [];
  return {
    items,
    notice,
    addFiles,
    toggleWorkspace,
    selected: items.flatMap((item) => (item.attachment ? [item.attachment] : [])),
    pending: items.some((item) => ['queued', 'uploading', 'processing'].includes(item.phase)),
    failed: items.some((item) => item.phase === 'error'),
    dismissNotice: () => setNotice(''),
    remove(key: string) {
      if (conversationId) update(conversationId, (old) => old.filter((item) => item.key !== key));
    },
    retry(key: string) {
      if (!conversationId) return;
      const item = current.current[conversationId]?.find(
        (value) => value.key === key && value.phase === 'error',
      );
      if (!item) return;
      update(conversationId, (old) =>
        old.map((value) =>
          value.key === key ? { ...value, phase: 'queued', error: undefined } : value,
        ),
      );
      process(conversationId, item);
    },
    clear(id: string) {
      update(id, () => []);
    },
    forget(id: string) {
      update(id, () => []);
    },
  };
}
export type AttachmentState = ReturnType<typeof useAttachments>;
