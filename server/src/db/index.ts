import { DatabaseSync } from 'node:sqlite';

export type AppDatabase = DatabaseSync;
export function openDatabase(filename: string): AppDatabase {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (version.user_version === 0)
    db.exec(`
    BEGIN;
    CREATE TABLE users(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
    CREATE TABLE folders(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, parent_id TEXT REFERENCES folders(id));
    CREATE TABLE files(id TEXT PRIMARY KEY, unit_id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, name TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), folder_id TEXT REFERENCES folders(id), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER);
    CREATE TABLE permissions(file_id TEXT NOT NULL REFERENCES files(id), user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL CHECK(role IN ('viewer','editor')), PRIMARY KEY(file_id,user_id));
    CREATE TABLE file_links(id TEXT PRIMARY KEY, file_id TEXT NOT NULL REFERENCES files(id), token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE conversations(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), file_id TEXT NOT NULL REFERENCES files(id), title TEXT NOT NULL, mode TEXT NOT NULL, updated_at INTEGER NOT NULL, referenced_ids TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE messages(id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role TEXT NOT NULL, text TEXT NOT NULL, reasoning TEXT NOT NULL DEFAULT '', run_id TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE conversation_links(id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, published_json TEXT NOT NULL, referenced_ids TEXT NOT NULL, expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE profiles(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), config_json TEXT NOT NULL);
    CREATE TABLE runs(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, file_id TEXT NOT NULL REFERENCES files(id), status TEXT NOT NULL, created_at INTEGER NOT NULL, error TEXT);
    CREATE TABLE run_events(run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, seq INTEGER NOT NULL, event_json TEXT NOT NULL, PRIMARY KEY(run_id,seq));
    CREATE TABLE run_changes(id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, file_id TEXT NOT NULL REFERENCES files(id), operation_id TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL, changeset_id TEXT NOT NULL, summary TEXT NOT NULL, location_json TEXT, checked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE operations(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, file_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, result_json TEXT, created_at INTEGER NOT NULL);
    CREATE INDEX conversations_by_file ON conversations(owner_id,file_id,updated_at DESC);
    CREATE INDEX events_by_run ON run_events(run_id,seq);
    PRAGMA user_version=1;
    COMMIT;
  `);
  if (version.user_version < 2)
    db.exec(`
    BEGIN;
    CREATE TABLE run_changes_v2(id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, file_id TEXT NOT NULL REFERENCES files(id), operation_id TEXT NOT NULL, revision INTEGER NOT NULL, changeset_id TEXT NOT NULL, summary TEXT NOT NULL, location_json TEXT, checked INTEGER NOT NULL DEFAULT 0);
    INSERT INTO run_changes_v2 SELECT * FROM run_changes;
    DROP TABLE run_changes;
    ALTER TABLE run_changes_v2 RENAME TO run_changes;
    CREATE INDEX changes_by_operation ON run_changes(operation_id);
    PRAGMA user_version=2;
    COMMIT;
  `);
  if (version.user_version < 3)
    db.exec(
      `BEGIN; ALTER TABLE files ADD COLUMN document_flavor TEXT CHECK(document_flavor IN ('modern','traditional')); PRAGMA user_version=3; COMMIT;`,
    );
  if (version.user_version < 4)
    db.exec('BEGIN; ALTER TABLE files ADD COLUMN emoji TEXT; PRAGMA user_version=4; COMMIT;');
  if (version.user_version < 5)
    db.exec(`
      BEGIN;
      ALTER TABLE messages ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]';
      CREATE TABLE attachments(
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        owner_id TEXT NOT NULL REFERENCES users(id), metadata_json TEXT NOT NULL,
        media_type TEXT NOT NULL, content BLOB NOT NULL, preview BLOB, text TEXT NOT NULL
      );
      CREATE INDEX attachments_by_conversation ON attachments(conversation_id);
      PRAGMA user_version=5;
      COMMIT;
    `);
  if (version.user_version > 5)
    throw new Error('This database was created by a newer application version.');
  db.exec(
    'CREATE INDEX IF NOT EXISTS messages_by_conversation ON messages(conversation_id,created_at);',
  );
  db.prepare(
    "UPDATE runs SET status='interrupted', error='The server restarted before this run finished.' WHERE status IN ('running','queued')",
  ).run();
  return db;
}
