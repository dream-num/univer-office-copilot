import type { ModelOption } from '@univer-copilot/shared';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    throw new ApiError(
      body.error?.code ?? 'REQUEST_FAILED',
      body.error?.message ?? `Request failed (${response.status}).`,
    );
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}
export const post = <T>(path: string, body: unknown = {}) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export function upload<T>(
  path: string,
  file: File,
  options: {
    signal?: AbortSignal;
    onProgress?(percent: number): void;
    onProcessing?(): void;
  } = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new DOMException('Upload stopped.', 'AbortError'));
      return;
    }
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const finish = (error?: Error, value?: T) => {
      options.signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(value!);
    };
    request.open('POST', `/api${path}`);
    request.responseType = 'json';
    request.timeout = 90000;
    request.setRequestHeader('Content-Type', 'application/octet-stream');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        options.onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    request.upload.onload = () => options.onProcessing?.();
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? finish(undefined, request.response as T)
        : finish(
            new ApiError(
              request.response?.error?.code ?? 'UPLOAD_FAILED',
              request.response?.error?.message ?? `Upload failed (${request.status}).`,
            ),
          );
    request.onerror = () =>
      finish(new ApiError('UPLOAD_FAILED', 'Upload failed. Check your connection and retry.'));
    request.ontimeout = () =>
      finish(new ApiError('UPLOAD_TIMEOUT', 'Upload took too long. Try again.'));
    request.onabort = () => finish(new DOMException('Upload stopped.', 'AbortError'));
    options.signal?.addEventListener('abort', abort, { once: true });
    request.send(file);
  });
}
export function loadDeepSeekModels(apiKey?: string, signal?: AbortSignal) {
  return api<{ models: ModelOption[] }>('/providers/deepseek/models', {
    method: 'POST',
    body: JSON.stringify({ apiKey: apiKey || undefined }),
    signal,
  });
}

export async function* ndjson(response: Response): AsyncGenerator<unknown> {
  if (!response.body) throw new Error('The server did not return an event stream.');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      if (pending.length > 1024 * 1024)
        throw new Error('The event stream exceeded its frame limit.');
      let newline: number;
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        if (line.trim()) yield JSON.parse(line);
      }
      if (done) {
        if (pending.trim()) yield JSON.parse(pending);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
