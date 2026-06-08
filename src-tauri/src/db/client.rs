use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Db(pub Mutex<Connection>);

pub fn get_db_path(app_data_dir: &PathBuf) -> PathBuf {
    let db_dir = app_data_dir.join("runtime");
    fs::create_dir_all(&db_dir).ok();
    db_dir.join("apimocktle.sqlite")
}

fn create_tables(conn: &Connection) {
    conn.execute_batch(
        "
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

        CREATE TABLE IF NOT EXISTS menu_items (
            project_id TEXT NOT NULL,
            id TEXT NOT NULL,
            parent_id TEXT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            data_json TEXT,
            run_tab_json TEXT,
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

        CREATE TABLE IF NOT EXISTS personal_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL DEFAULT 'default',
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
        CREATE INDEX IF NOT EXISTS idx_menu_items_project_parent ON menu_items(project_id, parent_id);
        CREATE INDEX IF NOT EXISTS idx_menu_items_project_sort ON menu_items(project_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_recycle_items_project ON recycle_items(project_id);
        CREATE INDEX IF NOT EXISTS idx_recycle_items_expires_at ON recycle_items(expires_at);
        CREATE INDEX IF NOT EXISTS idx_share_links_project_id ON share_links(project_id);
        ",
    )
    .expect("Failed to create database tables");

    // Migrations
    run_migrations(conn);
}

fn run_migrations(conn: &Connection) {
    let has_icon_col: bool = conn
        .prepare("SELECT 1 AS yes FROM pragma_table_info('projects') WHERE name = 'icon'")
        .and_then(|mut s| s.exists([]))
        .unwrap_or(false);

    if !has_icon_col {
        conn.execute("ALTER TABLE projects ADD COLUMN icon TEXT NOT NULL DEFAULT ''", [])
            .ok();
    }

    // request_history table
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS request_history (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            menu_item_id TEXT NOT NULL,
            request_json TEXT NOT NULL,
            response_json TEXT NOT NULL,
            status_code INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_request_history_menu ON request_history(project_id, menu_item_id);",
    ).ok();

    // Add run_tab_json column to menu_items if not exists
    let has_run_tab_json: bool = conn
        .prepare("SELECT 1 AS yes FROM pragma_table_info('menu_items') WHERE name = 'run_tab_json'")
        .and_then(|mut s| s.exists([]))
        .unwrap_or(false);

    if !has_run_tab_json {
        conn.execute("ALTER TABLE menu_items ADD COLUMN run_tab_json TEXT", [])
            .ok();
    }

    // Add extractors_json column to test_steps if not exists
    let has_extractors_json: bool = conn
        .prepare("SELECT 1 AS yes FROM pragma_table_info('test_steps') WHERE name = 'extractors_json'")
        .and_then(|mut s| s.exists([]))
        .unwrap_or(false);

    if !has_extractors_json {
        conn.execute("ALTER TABLE test_steps ADD COLUMN extractors_json TEXT", [])
            .ok();
    }

    // Test automation tables
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS test_tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            environment_id TEXT,
            environment_json TEXT,
            variables_json TEXT,
            status TEXT NOT NULL DEFAULT 'idle',
            fail_fast INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS test_steps (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            name TEXT NOT NULL DEFAULT '',
            menu_item_id TEXT NOT NULL,
            request_override_json TEXT,
            pre_script TEXT,
            post_script TEXT,
            assertions_json TEXT,
            extractors_json TEXT,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES test_tasks(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS test_executions (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            status TEXT NOT NULL,
            total_steps INTEGER NOT NULL DEFAULT 0,
            passed_steps INTEGER NOT NULL DEFAULT 0,
            failed_steps INTEGER NOT NULL DEFAULT 0,
            skipped_steps INTEGER NOT NULL DEFAULT 0,
            total_duration_ms INTEGER NOT NULL DEFAULT 0,
            environment_json TEXT,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            FOREIGN KEY (task_id) REFERENCES test_tasks(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS test_step_results (
            id TEXT PRIMARY KEY,
            execution_id TEXT NOT NULL,
            step_id TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL,
            request_json TEXT,
            response_json TEXT,
            script_results_json TEXT,
            variable_deltas_json TEXT,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            executed_at TEXT NOT NULL,
            FOREIGN KEY (execution_id) REFERENCES test_executions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_test_tasks_project ON test_tasks(project_id);
        CREATE INDEX IF NOT EXISTS idx_test_steps_task ON test_steps(task_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_test_executions_task ON test_executions(task_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_test_step_results_exec ON test_step_results(execution_id, sort_order);
        ",
    ).ok();

    // Flow graph persistence
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS test_flow_graphs (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL UNIQUE,
            graph_json TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES test_tasks(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_test_flow_graphs_task ON test_flow_graphs(task_id);
        ",
    ).ok();

    // v1.4.0 迁移：为已存在的 test_tasks 表补充 variables_json 列
    conn.execute(
        "ALTER TABLE test_tasks ADD COLUMN variables_json TEXT",
        [],
    ).ok(); // 已存在则静默忽略

    // v1.5.0 迁移：测试任务文件夹分组
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS test_folders (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_test_folders_project ON test_folders(project_id, sort_order);
        ",
    ).ok();

    conn.execute(
        "ALTER TABLE test_tasks ADD COLUMN folder_id TEXT",
        [],
    ).ok(); // 已存在则静默忽略
}

pub fn init_database(app_data_dir: &PathBuf) -> Db {
    let db_path = get_db_path(app_data_dir);

    // Try to migrate data from old runtime directory
    let old_db_path = std::env::current_dir()
        .unwrap_or_default()
        .join("runtime")
        .join("apimocktle.sqlite");

    if old_db_path.exists() && !db_path.exists() {
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).ok();
        }
        fs::copy(&old_db_path, &db_path).ok();
    }

    let conn = Connection::open(&db_path).expect("Failed to open database");
    create_tables(&conn);

    Db(Mutex::new(conn))
}
