import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const runtimeDir = path.join(process.cwd(), 'runtime')
const dbFilePath = path.join(runtimeDir, 'apifox-collab.sqlite')

function ensureRuntimeDir() {
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true })
  }
}

function createDb() {
  ensureRuntimeDir()

  const db = new DatabaseSync(dbFilePath)

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
      created_at TEXT NOT NULL,
      PRIMARY KEY (project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_invitations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      inviter_user_id TEXT NOT NULL,
      accepted_by_user_id TEXT,
      role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'revoked')),
      expires_at INTEGER NOT NULL,
      accepted_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (inviter_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      project_id TEXT NOT NULL,
      id TEXT NOT NULL,
      parent_id TEXT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      data_json TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recycle_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      catalog_type TEXT NOT NULL,
      deleted_item_json TEXT NOT NULL,
      creator_json TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS meta (
      project_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (project_id, key),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS shared_docs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      creator_user_id TEXT NOT NULL,
      doc_type TEXT NOT NULL DEFAULT 'markdown' CHECK (doc_type IN ('markdown', 'excel')),
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      y_state_base64 TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (creator_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS shared_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      uploader_user_id TEXT NOT NULL,
      linked_doc_id TEXT,
      name TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (uploader_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (linked_doc_id) REFERENCES shared_docs(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS shared_doc_presence (
      project_id TEXT NOT NULL,
      doc_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      is_typing INTEGER NOT NULL DEFAULT 0,
      last_seen_at INTEGER NOT NULL,
      PRIMARY KEY (project_id, doc_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (doc_id) REFERENCES shared_docs(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_project_invitations_project_id ON project_invitations(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_invitations_status_expires_at ON project_invitations(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_menu_items_project_parent ON menu_items(project_id, parent_id);
    CREATE INDEX IF NOT EXISTS idx_menu_items_project_sort ON menu_items(project_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_recycle_items_project ON recycle_items(project_id);
    CREATE INDEX IF NOT EXISTS idx_recycle_items_expires_at ON recycle_items(expires_at);
    CREATE INDEX IF NOT EXISTS idx_shared_files_project_created_at ON shared_files(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shared_files_linked_doc_id ON shared_files(linked_doc_id);
    CREATE INDEX IF NOT EXISTS idx_shared_docs_project_updated_at ON shared_docs(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shared_doc_presence_seen_at ON shared_doc_presence(last_seen_at);

    CREATE TABLE IF NOT EXISTS share_links (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      creator_user_id TEXT NOT NULL,
      api_menu_ids TEXT NOT NULL DEFAULT '[]',
      password_hash TEXT,
      expires_at TEXT,
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (creator_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_share_links_project_id ON share_links(project_id);
  `)

  const hasDocType = db.prepare(`
    SELECT 1 AS yes
    FROM pragma_table_info('shared_docs')
    WHERE name = 'doc_type'
    LIMIT 1
  `).get() as { yes: number } | undefined

  if (!hasDocType) {
    db.exec(`
      ALTER TABLE shared_docs
      ADD COLUMN doc_type TEXT NOT NULL DEFAULT 'markdown'
      CHECK (doc_type IN ('markdown', 'excel'));
    `)
  }

  return db
}

export const db = createDb()
