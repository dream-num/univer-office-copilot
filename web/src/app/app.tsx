import { useEffect, useRef, useState } from 'react';
import { Clock3, Download, Plus, Share2, X } from 'lucide-react';
import type {
  DocumentFlavor,
  FileType,
  Folder,
  ModelProfile,
  OfficeFile,
  User,
} from '@univer-copilot/shared';
import { productNames } from '@univer-copilot/shared';
import { api, post } from '../api/client.ts';
import { Button } from '../components/button.tsx';
import { CopilotPanel } from './copilot-panel.tsx';
import { SignIn } from '../features/auth/index.tsx';
import { OfficeEditor, type EditorHandle } from '../features/editor/index.ts';
import { Copilot } from '../features/copilot/index.tsx';
import { ModelSettings, loadProfiles } from '../features/settings/index.tsx';
import {
  WorkspaceSidebar,
  ShareDialog,
  ProductIcon,
  FileExportDialog,
} from '../features/workspace/index.tsx';

type Config = { demo: boolean; clientLicense: string; sdkVersion: string };
function PublishedConversation({ token }: { token: string }) {
  const [value, setValue] = useState<{
      title: string;
      messages: {
        role: string;
        text: string;
        modifications?: { revision: number; summary: string }[];
      }[];
    }>(),
    [error, setError] = useState('');
  useEffect(() => {
    void api<typeof value>(`/shared/conversations/${token}`)
      .then(setValue)
      .catch((e) => setError(e.message));
  }, [token]);
  return (
    <main className="published-conversation">
      <a href="/" className="brand">
        <img className="univer-logo" src="/univer-logo.svg" width={28} height={28} alt="" />
        Univer Office Copilot
      </a>
      <h1>{value?.title ?? 'Shared conversation'}</h1>
      {error && <p role="alert">{error}</p>}
      {value?.messages.map((message, index) => (
        <article key={index} className={`chat-message chat-message-${message.role}`}>
          <strong>{message.role === 'user' ? 'User' : 'Copilot'}</strong>
          <div className="message-text">{message.text}</div>
          {!!message.modifications?.length && (
            <ul className="published-changes">
              {message.modifications.map((change) => (
                <li key={change.revision}>
                  {change.summary} · Version {change.revision}
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
      <a href="/">Open your workspace →</a>
    </main>
  );
}

export function App() {
  const sharedMatch = location.pathname.match(/^\/share\/(file|conversation)\/([^/]+)$/);
  const [config, setConfig] = useState<Config>(),
    [user, setUser] = useState<User | null>(),
    [files, setFiles] = useState<OfficeFile[]>([]),
    [folders, setFolders] = useState<Folder[]>([]),
    [file, setFile] = useState<OfficeFile | null>(null),
    [profiles, setProfiles] = useState<ModelProfile[]>([]),
    [keys, setKeys] = useState<Record<string, string>>({}),
    [error, setError] = useState(''),
    [status, setStatus] = useState('loading'),
    [members, setMembers] = useState<string[]>([]),
    [modelsOpen, setModelsOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [share, setShare] = useState<{
      kind: 'file' | 'conversation';
      id: string;
      name: string;
    } | null>(null),
    [leftClosed, setLeftClosed] = useState(() => {
      try {
        return localStorage.getItem('univer-copilot:workspace-collapsed') !== 'false';
      } catch {
        return true;
      }
    }),
    [rightClosed, setRightClosed] = useState(() => window.matchMedia('(max-width: 760px)').matches),
    [historyOpening, setHistoryOpening] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const editor = useRef<EditorHandle | null>(null),
    currentFile = useRef(file);
  currentFile.current = file;
  useEffect(() => {
    try {
      localStorage.setItem('univer-copilot:workspace-collapsed', String(leftClosed));
    } catch {
      /* Workspace preferences are optional when storage is unavailable. */
    }
  }, [leftClosed]);
  const sharedFile = sharedMatch?.[1] === 'file';
  async function refresh() {
    const [result, folderResult] = await Promise.all([
      api<{ files: OfficeFile[] }>('/files'),
      api<{ folders: Folder[] }>('/folders'),
    ]);
    setFiles(result.files);
    setFile((current) =>
      current ? (result.files.find((item) => item.id === current.id) ?? current) : current,
    );
    setFolders(folderResult.folders);
    return result.files;
  }
  async function openFile(next: OfficeFile) {
    if (next.id === currentFile.current?.id) return;
    await editor.current?.flush();
    setStatus('loading');
    setFile(next);
    history.pushState({}, '', `/?file=${next.id}`);
    setHistoryOpen(false);
  }
  async function openHistory() {
    if (!editor.current || historyOpen || historyOpening) return;
    setHistoryOpening(true);
    try {
      await editor.current.openHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'File history could not open.');
    } finally {
      setHistoryOpening(false);
    }
  }
  async function create(type: FileType, documentFlavor?: DocumentFlavor) {
    await editor.current?.flush();
    const result = await post<{ file: OfficeFile }>('/files', {
      type,
      documentFlavor,
      name:
        documentFlavor === 'traditional'
          ? 'Untitled paged document'
          : `Untitled ${productNames[type].toLowerCase()}`,
    });
    await refresh();
    await openFile(result.file);
  }
  async function initialize() {
    setError('');
    try {
      const cfg = await api<Config>('/config');
      setConfig(cfg);
      if (sharedMatch?.[1] === 'conversation') return;
      if (sharedFile) {
        const result = await api<{ file: OfficeFile; actorId: string }>(
          `/shared/files/${sharedMatch![2]}`,
        );
        setUser({ id: result.actorId, name: 'Guest viewer', email: '' });
        setFile(result.file);
        return;
      }
      let me = (await api<{ user: User | null }>('/me')).user;
      if (!me && cfg.demo)
        me = (await post<{ user: User }>('/auth/demo', { name: 'Demo user' })).user;
      setUser(me);
      if (!me) return;
      const list = await refresh();
      setProfiles(await loadProfiles());
      const id = new URL(location.href).searchParams.get('file');
      if (id) {
        const selected =
          list.find((f) => f.id === id) ?? (await api<{ file: OfficeFile }>(`/files/${id}`)).file;
        setFile(selected);
      } else if (list[0]) setFile(list[0]);
      else await create('sheet');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to open your workspace.');
    }
  }
  useEffect(() => {
    void initialize();
    const pop = () => {
      const id = new URL(location.href).searchParams.get('file');
      if (id)
        void api<{ file: OfficeFile }>(`/files/${id}`)
          .then((x) => {
            setFile(x.file);
          })
          .catch((e) => setError(e.message));
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  if (sharedMatch?.[1] === 'conversation') return <PublishedConversation token={sharedMatch[2]!} />;
  if (user === null) return <SignIn onSignedIn={() => void initialize()} />;
  if (!user || !config)
    return (
      <main className="startup">
        <img className="univer-logo" src="/univer-logo.svg" width={32} height={32} alt="Univer" />
        <p>{error || 'Opening your workspace…'}</p>
        {error && <Button onClick={() => void initialize()}>Try again</Button>}
      </main>
    );
  const saveLabel =
    status === 'synced'
      ? 'Saved'
      : status === 'offline'
        ? 'Offline · not saved'
        : status === 'preview'
          ? 'Read-only preview'
          : status === 'conflict'
            ? 'Sync conflict'
            : status === 'loading'
              ? 'Opening…'
              : 'Syncing…';
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" onClick={(e) => e.preventDefault()}>
          <img className="univer-logo" src="/univer-logo.svg" width={28} height={28} alt="" />
          <span>
            Univer <strong>Office Copilot</strong>
          </span>
        </a>
        <div className="file-title">
          {file && (
            <>
              <ProductIcon
                type={file.type}
                documentFlavor={file.documentFlavor}
                emoji={file.emoji}
              />
              <strong className={`product-name-${file.type}`}>{file.name}</strong>
              <span className={`save-state ${status === 'synced' ? 'saved' : ''}`}>
                <i />
                {saveLabel}
              </span>
            </>
          )}
        </div>
        <div className="topbar-actions">
          {members.length > 1 && (
            <span className="members" title={members.join(', ')}>
              {members.length} online
            </span>
          )}
          {file && (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={
                  file.role === 'viewer' || historyOpen || historyOpening || status === 'loading'
                }
                aria-pressed={historyOpen}
                onClick={() => void openHistory()}
              >
                <Clock3 size={16} />
                History
              </Button>
              {!sharedMatch && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Export file"
                  disabled={historyOpen || status === 'loading'}
                  onClick={() => setExportOpen(true)}
                >
                  <Download size={17} />
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                disabled={file.role !== 'owner'}
                onClick={() => setShare({ kind: 'file', id: file.id, name: file.name })}
              >
                <Share2 size={15} />
                Share file
              </Button>
            </>
          )}
        </div>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss error"
            onClick={() => setError('')}
          >
            <X size={16} />
          </Button>
        </div>
      )}
      <div className="workspace-layout">
        {!sharedFile && (
          <WorkspaceSidebar
            files={files}
            folders={folders}
            activeId={file?.id}
            onOpen={openFile}
            onCreate={create}
            onRefresh={async () => {
              const next = await refresh();
              if (file && !next.some((f) => f.id === file.id)) setFile(next[0] ?? null);
            }}
            onError={setError}
            collapsed={leftClosed}
            onToggle={() => setLeftClosed(!leftClosed)}
          />
        )}
        <main className="office-area">
          {file ? (
            <OfficeEditor
              key={`${file.id}:${editorEpoch}`}
              file={file}
              user={user}
              license={config.clientLicense}
              onHistoryOpen={setHistoryOpen}
              onRestored={() => {
                setStatus('loading');
                setEditorEpoch((epoch) => epoch + 1);
              }}
              shared={sharedFile}
              onReady={(value) => {
                editor.current = value;
              }}
              onStatus={setStatus}
              onMembers={setMembers}
            />
          ) : (
            <div className="workspace-empty">
              <Button onClick={() => void create('sheet')}>
                <Plus size={16} />
                New spreadsheet
              </Button>
            </div>
          )}
        </main>
        {file && !sharedFile && (
          <CopilotPanel
            hidden={historyOpen}
            closed={rightClosed}
            onToggle={() => setRightClosed(!rightClosed)}
          >
            <Copilot
              key={file.id}
              file={file}
              availableFiles={files}
              onFilesImported={async () => {
                await refresh();
              }}
              profiles={profiles}
              keys={keys}
              onProfileUpdated={(profile) =>
                setProfiles((old) => old.map((item) => (item.id === profile.id ? profile : item)))
              }
              onSettings={() => setModelsOpen(true)}
              flush={async () => {
                if (historyOpen || historyOpening)
                  throw new Error('Close file history before sending a new request.');
                if (!editor.current) throw new Error('Wait for the file to finish opening.');
                await editor.current.flush();
              }}
              selection={() => editor.current?.selection() ?? null}
              onShare={(id) => setShare({ kind: 'conversation', id, name: 'Conversation' })}
              onLocate={(value) => editor.current?.locate(value)}
              historyOpen={historyOpen || historyOpening}
              onHistory={() => void openHistory()}
              compareVersions={(before, after) => {
                if (!editor.current) throw new Error('Wait for the file to finish opening.');
                return editor.current.compareVersions(before, after);
              }}
              onRestored={() => {
                setStatus('loading');
                setEditorEpoch((epoch) => epoch + 1);
              }}
              onError={setError}
            />
          </CopilotPanel>
        )}
      </div>
      {!sharedFile && (
        <ModelSettings
          open={modelsOpen}
          onClose={() => setModelsOpen(false)}
          profiles={profiles}
          keys={keys}
          onKey={(id, key) => setKeys((old) => ({ ...old, [id]: key }))}
          onSaved={(profile) =>
            setProfiles((old) => [...old.filter((p) => p.id !== profile.id), profile])
          }
        />
      )}
      {exportOpen && file && (
        <FileExportDialog
          file={file}
          onClose={() => setExportOpen(false)}
          beforeExport={async () => {
            await editor.current?.flush();
          }}
        />
      )}
      <ShareDialog target={share} onClose={() => setShare(null)} />
    </div>
  );
}
