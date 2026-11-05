import { useEffect, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Plus,
  Search,
  Folder,
  Files,
  Users,
  Trash2,
  MoreHorizontal,
  Copy,
  Share2,
  RotateCcw,
  ChevronDown,
  Layers,
  Upload,
} from 'lucide-react';
import {
  fileTypes,
  productNames,
  type FileType,
  type DocumentFlavor,
  type OfficeFile,
  type Folder as FolderType,
} from '@univer-copilot/shared';
import { api, post } from '../../api/client.ts';
import { Input, Field } from '../../components/input.tsx';
import { Select } from '../../components/select.tsx';
import { ConfirmDialog } from '../../components/confirm-dialog.tsx';
import { TextEntryDialog } from '../../components/text-entry-dialog.tsx';
import { Button } from '../../components/button.tsx';
import { Dialog } from '../../components/dialog.tsx';
import { PanelHandle } from '../../components/panel-handle.tsx';
import { FileEmojiPicker } from './file-emoji-picker.tsx';
import { FileImportDialog } from './transfer.tsx';
import { ProductIcon } from '../../components/product-icon.tsx';
export { ProductIcon } from '../../components/product-icon.tsx';
export { FileExportDialog } from './transfer.tsx';
import { MenuContent, MenuItem, MenuSeparator } from '../../components/menu.tsx';

function NewFileMenu({
  compact,
  onCreate,
  onError,
  onImport,
}: {
  compact: boolean;
  onImport(): void;
  onCreate(type: FileType, documentFlavor?: DocumentFlavor): Promise<void>;
  onError(message: string): void;
}) {
  return (
    <div className={`new-file-menu ${compact ? 'compact' : ''}`}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            type="button"
            variant={compact ? 'ghost' : 'default'}
            className={compact ? 'app:size-8 app:p-0' : 'app:w-full app:justify-start'}
            aria-label="New file"
            tooltip={compact ? 'Create a file' : undefined}
          >
            <Plus size={17} />
            <span className={compact ? 'sr-only' : ''}>New file</span>
            {!compact && <ChevronDown size={13} className="new-file-chevron" />}
          </Button>
        </DropdownMenu.Trigger>
        <MenuContent side={compact ? 'right' : 'bottom'} align="start" className="app:w-56">
          {fileTypes.map((type) => (
            <MenuItem
              key={type}
              onSelect={() => {
                void onCreate(type).catch((error) => onError(error.message));
              }}
            >
              <ProductIcon type={type} />
              {type === 'doc' ? 'Modern document' : productNames[type]}
            </MenuItem>
          ))}
          <MenuItem
            onSelect={() => {
              void onCreate('doc', 'traditional').catch((error) => onError(error.message));
            }}
          >
            <ProductIcon type="doc" documentFlavor="traditional" />
            Paged document
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={onImport}>
            <Upload size={17} />
            Import file…
          </MenuItem>
        </MenuContent>
      </DropdownMenu.Root>
    </div>
  );
}
export function WorkspaceSidebar({
  files,
  folders,
  activeId,
  onOpen,
  onCreate,
  onRefresh,
  onError,
  collapsed,
  onToggle,
}: {
  files: OfficeFile[];
  folders: FolderType[];
  activeId?: string;
  onOpen(file: OfficeFile): Promise<void>;
  onCreate(type: FileType, documentFlavor?: DocumentFlavor): Promise<void>;
  onRefresh(): Promise<void>;
  onError(message: string): void;
  collapsed: boolean;
  onToggle(): void;
}) {
  const [query, setQuery] = useState(''),
    [tab, setTab] = useState('all'),
    [trash, setTrash] = useState<OfficeFile[]>([]),
    [editing, setEditing] = useState<OfficeFile | null>(null),
    [name, setName] = useState(''),
    [emoji, setEmoji] = useState<string | null>(null),
    [folder, setFolder] = useState(''),
    [folderOpen, setFolderOpen] = useState(false),
    [importOpen, setImportOpen] = useState(false),
    [manageError, setManageError] = useState(''),
    [manageBusy, setManageBusy] = useState(false),
    [trashTarget, setTrashTarget] = useState<OfficeFile | null>(null);
  useEffect(() => {
    if (tab === 'trash')
      void api<{ files: OfficeFile[] }>('/files?trash=true')
        .then((x) => setTrash(x.files))
        .catch((e) => onError(e.message));
  }, [tab]);
  const shown = (tab === 'trash' ? trash : files)
    .filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    .filter((f) =>
      tab === 'shared'
        ? f.role !== 'owner'
        : tab.startsWith('folder:')
          ? f.folderId === tab.slice(7)
          : true,
    );
  async function save() {
    if (!editing) return;
    setManageBusy(true);
    setManageError('');
    try {
      await api(`/files/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, folderId: folder || null, emoji }),
      });
      setEditing(null);
      await onRefresh();
    } catch (cause) {
      setManageError(cause instanceof Error ? cause.message : 'The file could not be updated.');
    } finally {
      setManageBusy(false);
    }
  }
  return (
    <nav
      className={`workspace-sidebar ${collapsed ? 'collapsed' : ''}`}
      aria-label="Workspace files"
      onKeyDown={(event) => {
        if (
          event.key === 'Escape' &&
          !collapsed &&
          event.target instanceof Node &&
          event.currentTarget.contains(event.target)
        )
          onToggle();
      }}
    >
      <PanelHandle
        side="left"
        collapsed={collapsed}
        expandLabel="Expand workspace"
        collapseLabel="Collapse workspace"
        onToggle={onToggle}
      />
      <div className="sidebar-heading">{!collapsed && <strong>Workspace</strong>}</div>
      <NewFileMenu
        compact={collapsed}
        onCreate={onCreate}
        onError={onError}
        onImport={() => setImportOpen(true)}
      />
      {importOpen && (
        <FileImportDialog
          onClose={() => setImportOpen(false)}
          onImported={async (file) => {
            await onRefresh();
            await onOpen(file);
          }}
        />
      )}
      {collapsed && (
        <div className="workspace-rail">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Browse workspace files"
            title="Browse workspace files"
            onClick={() => {
              setTab('all');
              onToggle();
            }}
          >
            <Files size={17} />
          </Button>
          <div className="rail-divider" />
          <div className="rail-files">
            {files.slice(0, 6).map((value) => (
              <Button
                key={value.id}
                size="icon"
                variant="ghost"
                className="rail-file"
                aria-label={`Open ${value.name}`}
                title={value.name}
                aria-current={value.id === activeId ? 'page' : undefined}
                onClick={() => void onOpen(value).catch((error) => onError(error.message))}
              >
                <ProductIcon
                  type={value.type}
                  documentFlavor={value.documentFlavor}
                  emoji={value.emoji}
                />
              </Button>
            ))}
          </div>
          <div className="rail-secondary">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Browse shared files"
              title="Shared with me"
              onClick={() => {
                setTab('shared');
                onToggle();
              }}
            >
              <Users size={17} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Browse trash"
              title="Trash"
              onClick={() => {
                setTab('trash');
                onToggle();
              }}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </div>
      )}
      {!collapsed && (
        <div className="workspace-content">
          <div className="file-search">
            <Search size={15} />
            <Input
              aria-label="Search files"
              placeholder="Search files…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="nav-sections">
            <button className={tab === 'all' ? 'selected' : ''} onClick={() => setTab('all')}>
              <Files size={16} />
              All files<span>{files.length}</span>
            </button>
            <button className={tab === 'shared' ? 'selected' : ''} onClick={() => setTab('shared')}>
              <Users size={16} />
              Shared with me
            </button>
            <button className={tab === 'trash' ? 'selected' : ''} onClick={() => setTab('trash')}>
              <Trash2 size={16} />
              Trash
            </button>
          </div>
          <div className="folder-heading">
            <span>FOLDERS</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="New folder"
              onClick={() => {
                setFolderOpen(true);
              }}
            >
              <Plus size={14} />
            </Button>
          </div>
          {folders.map((f) => (
            <button
              className={`folder-entry ${tab === `folder:${f.id}` ? 'selected' : ''}`}
              key={f.id}
              onClick={() => setTab(`folder:${f.id}`)}
            >
              <Folder size={15} />
              {f.name}
            </button>
          ))}
          <div className="file-list">
            {shown.length === 0 && (
              <p className="sidebar-empty">{query ? 'No matching files.' : 'No files here yet.'}</p>
            )}
            {shown.map((file) => (
              <div className={`file-row ${file.id === activeId ? 'active' : ''}`} key={file.id}>
                <button
                  className="file-entry"
                  disabled={tab === 'trash'}
                  onClick={() => void onOpen(file).catch((e) => onError(e.message))}
                >
                  <ProductIcon
                    type={file.type}
                    documentFlavor={file.documentFlavor}
                    emoji={file.emoji}
                  />
                  <span className={`product-name-${file.type}`}>{file.name}</span>
                </button>
                {tab === 'trash' ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Recover ${file.name}`}
                    onClick={() =>
                      void post(`/files/${file.id}/recover`)
                        .then(async () => {
                          setTrash(trash.filter((f) => f.id !== file.id));
                          await onRefresh();
                        })
                        .catch((e) => onError(e.message))
                    }
                  >
                    <RotateCcw size={14} />
                  </Button>
                ) : (
                  file.role === 'owner' && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Manage ${file.name}`}
                      onClick={() => {
                        setEditing(file);
                        setManageError('');
                        setName(file.name);
                        setEmoji(file.emoji ?? null);
                        setFolder(file.folderId ?? '');
                      }}
                    >
                      <MoreHorizontal size={15} />
                    </Button>
                  )
                )}
              </div>
            ))}
          </div>
          <div className="sidebar-footer">
            <span className="workspace-avatar">
              <Layers size={15} />
            </span>
            <span>
              Personal workspace
              <small className="app-small">
                {files.length} {files.length === 1 ? 'file' : 'files'}
              </small>
            </span>
          </div>
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Manage file">
        <div className="settings-grid">
          <div className="app:flex app:items-end app:gap-3">
            <Field>
              Icon
              {editing && (
                <FileEmojiPicker
                  key={editing.id}
                  value={emoji}
                  onChange={setEmoji}
                  disabled={manageBusy}
                  defaultIcon={
                    <ProductIcon
                      type={editing.type}
                      documentFlavor={editing.documentFlavor}
                      size={20}
                    />
                  }
                />
              )}
            </Field>
            <Field className="app:flex-1">
              File name
              <Input value={name} disabled={manageBusy} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <Field>
            Folder
            <Select
              label="Folder"
              value={folder || 'root'}
              onValueChange={(value) => setFolder(value === 'root' ? '' : value)}
              options={[
                { value: 'root', label: 'Workspace root' },
                ...folders.map((f) => ({ value: f.id, label: f.name })),
              ]}
            />
          </Field>
          {manageError && (
            <p className="form-error" role="alert">
              {manageError}
            </p>
          )}
          <div className="dialog-actions app:justify-between">
            <Button
              variant="destructive"
              disabled={manageBusy}
              onClick={() => {
                setTrashTarget(editing);
              }}
            >
              Move to Trash
            </Button>
            <Button disabled={manageBusy || !name.trim()} onClick={() => void save()}>
              {manageBusy ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </Dialog>
      <TextEntryDialog
        open={folderOpen}
        onClose={() => setFolderOpen(false)}
        title="New folder"
        label="Folder name"
        confirmLabel="Create folder"
        onSubmit={async (name) => {
          await post('/folders', { name });
          await onRefresh();
        }}
      />
      <ConfirmDialog
        open={!!trashTarget}
        onClose={() => setTrashTarget(null)}
        title="Move file to Trash?"
        description={`“${trashTarget?.name ?? ''}” will leave this workspace. You can recover it from Trash.`}
        confirmLabel="Move to Trash"
        destructive
        onConfirm={async () => {
          if (!trashTarget) return;
          await api(`/files/${trashTarget.id}`, { method: 'DELETE' });
          setEditing(null);
          await onRefresh();
        }}
      />
    </nav>
  );
}

export function ShareDialog({
  target,
  onClose,
}: {
  target: { kind: 'file' | 'conversation'; id: string; name: string } | null;
  onClose(): void;
}) {
  const [url, setUrl] = useState(''),
    [links, setLinks] = useState<{ id: string; expiresAt: number; revoked: number }[]>([]),
    [email, setEmail] = useState(''),
    [role, setRole] = useState('viewer'),
    [permissions, setPermissions] = useState<
      { id: string; name: string; email: string; role: string }[]
    >([]),
    [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const showError = (cause: unknown) => {
    const message =
      cause instanceof Error ? cause.message : 'Sharing could not be updated. Try again.';
    setError(message);
  };
  const path = target ? `/${target.kind === 'file' ? 'files' : 'conversations'}/${target.id}` : '';
  async function refresh() {
    if (!target) return;
    setLinks((await api<{ links: typeof links }>(`${path}/share-links`)).links);
    if (target.kind === 'file')
      setPermissions(
        (await api<{ permissions: typeof permissions }>(`${path}/permissions`)).permissions,
      );
  }
  useEffect(() => {
    setUrl('');
    setNotice('');
    setError('');
    if (target) void refresh().catch(showError);
  }, [target?.id, target?.kind]);
  async function createLink() {
    setError('');
    const result = await post<{ token: string }>(`${path}/share-links`, { hours: 168 });
    setUrl(`${location.origin}/share/${target!.kind}/${result.token}`);
    await refresh();
  }
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={target?.kind === 'file' ? 'Share file' : 'Share conversation'}
      description={
        target?.kind === 'file'
          ? 'File sharing includes its content. Your conversations and model keys stay private.'
          : 'Publish completed messages and modification summaries. Later messages remain private.'
      }
    >
      <div className="settings-grid">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {target?.kind === 'file' && (
          <>
            <div className="invite-row">
              <Field>
                Invite an existing account
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@example.com"
                />
              </Field>
              <Select
                label="File permission"
                value={role}
                onValueChange={setRole}
                options={[
                  { value: 'viewer', label: 'Can view' },
                  { value: 'editor', label: 'Can edit' },
                ]}
              />
              <Button
                variant="secondary"
                disabled={!email.trim()}
                onClick={() => {
                  setError('');
                  void post(`${path}/permissions`, { email, role })
                    .then(async () => {
                      setEmail('');
                      await refresh();
                    })
                    .catch(showError);
                }}
              >
                Add person
              </Button>
            </div>
            {permissions.map((p) => (
              <div className="history-row" key={p.id}>
                <span>
                  {p.name}
                  <small className="app-small">
                    {p.email} · {p.role === 'editor' ? 'Can edit' : 'Can view'}
                  </small>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void post(`${path}/permissions`, { email: p.email, role: null })
                      .then(refresh)
                      .catch(showError)
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </>
        )}
        <div className="share-note">
          <Share2 size={18} />
          <div>
            <strong>
              {target?.kind === 'file' ? 'Read-only link' : 'Read-only published conversation'}
            </strong>
            <p>
              Anyone with the link can read it for seven days. You can close the link at any time.
            </p>
          </div>
        </div>
        {target?.kind === 'conversation' && (
          <p className="muted">
            Published words may contain excerpts from referenced files. The link does not grant
            file, attachment or version-history access. Reasoning and internal tool data are
            excluded.
          </p>
        )}
        <Button onClick={() => void createLink().catch(showError)}>Create a share link</Button>
        {url && (
          <div className="share-url">
            <Input readOnly value={url} aria-label="Share URL" onFocus={(e) => e.target.select()} />
            <Button
              variant="secondary"
              size="icon"
              aria-label="Copy share link"
              className="app:size-9"
              onClick={() =>
                void navigator.clipboard
                  .writeText(url)
                  .then(() => setNotice('Link copied.'))
                  .catch(() => setNotice('Select the link and copy it manually.'))
              }
            >
              <Copy size={16} />
            </Button>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
        {links
          .filter((link) => !link.revoked)
          .map((link) => (
            <div className="history-row" key={link.id}>
              <small className="app-small">
                Open until{' '}
                {new Date(link.expiresAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}
              </small>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void api(`${path}/share-links/${link.id}`, { method: 'DELETE' })
                    .then(refresh)
                    .catch(showError)
                }
              >
                Close link
              </Button>
            </div>
          ))}
      </div>
    </Dialog>
  );
}
