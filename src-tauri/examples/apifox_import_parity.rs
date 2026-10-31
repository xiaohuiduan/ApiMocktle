// 一次性对账工具（临时）：把 Apifox 导出的 OpenAPI 文件用**真实导入代码路径**入库，
// 并逐项核对「源 → 入库」的数量，同时验证重复导入的幂等性。
//
// 用法：cargo run --example apifox_import_parity -- <导出目录> <工作目录>
use std::collections::{BTreeSet, HashMap};
use std::path::PathBuf;
use std::time::Instant;

use apimocktle_lib::db::client::init_database;
use apimocktle_lib::services::import_service::import_api_document;
use serde_json::Value;

const HTTP_METHODS: [&str; 9] = [
    "get", "put", "post", "delete", "options", "head", "patch", "trace", "query",
];

fn split_folder_path(folder: &str) -> Vec<String> {
    folder
        .split('/')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

/// 复刻导入器的目录判定：优先 x-apifox-folder，其次第一个 tag；返回该接口的目录路径。
fn folder_path_of(operation: &Value) -> Option<String> {
    operation
        .get("x-apifox-folder")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .or_else(|| {
            operation
                .get("tags")
                .and_then(|t| t.as_array())
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
                .map(str::to_string)
        })
}

/// 源侧统计：接口数、模型数、期望目录树节点数。
fn source_stats(doc: &Value) -> (usize, usize, usize) {
    let mut apis = 0usize;
    let mut folders: BTreeSet<Vec<String>> = BTreeSet::new();

    if let Some(paths) = doc.get("paths").and_then(|v| v.as_object()) {
        for (_path, item) in paths {
            let Some(obj) = item.as_object() else { continue };
            for (method, operation) in obj {
                if !HTTP_METHODS.contains(&method.to_lowercase().as_str()) {
                    continue;
                }
                apis += 1;
                if let Some(path) = folder_path_of(operation) {
                    let segments = split_folder_path(&path);
                    for i in 0..segments.len() {
                        folders.insert(segments[..=i].to_vec());
                    }
                }
            }
        }
    }

    let schemas = doc
        .get("components")
        .and_then(|c| c.get("schemas"))
        .and_then(|s| s.as_object())
        .map(|o| o.len())
        .unwrap_or(0);

    (apis, schemas, folders.len())
}

fn counts(db: &apimocktle_lib::db::client::Db) -> HashMap<String, usize> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT type, COUNT(*) FROM menu_items GROUP BY type")
        .unwrap();
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, usize>(1)?))
        })
        .unwrap();
    let mut map = HashMap::new();
    for row in rows {
        let (t, c) = row.unwrap();
        map.insert(t, c);
    }
    map
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let export_dir = PathBuf::from(args.get(1).expect("需要导出目录"));
    let work_dir = PathBuf::from(args.get(2).expect("需要工作目录"));
    std::fs::create_dir_all(&work_dir).unwrap();

    let db = init_database(&work_dir);
    {
        let conn = db.0.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO users (id, username, password_hash, created_at)
             VALUES ('u1', 'tester', 'x', '2026-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO projects (id, name, owner_id, created_at)
             VALUES ('p1', 'apifox-parity', 'u1', '2026-01-01')",
            [],
        )
        .unwrap();
    }

    let mut files: Vec<PathBuf> = std::fs::read_dir(&export_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map(|x| x == "json").unwrap_or(false))
        .collect();
    files.sort();

    println!(
        "{:<28} {:>7} {:>7} {:>7} {:>7} {:>7} {:>7} {:>9}",
        "项目", "源接口", "入库接口", "源模型", "入库模型", "源目录", "入库目录", "耗时"
    );

    let mut totals = (0usize, 0usize, 0usize, 0usize, 0usize, 0usize);
    let mut first_file: Option<PathBuf> = None;

    for file in &files {
        let content = std::fs::read_to_string(file).unwrap();
        let source = file
            .file_name()
            .unwrap()
            .to_string_lossy()
            .replace(".openapi.json", "");
        let doc: Value = serde_json::from_str(&content).unwrap();
        let (src_apis, src_schemas, src_folders) = source_stats(&doc);
        let before = counts(&db);

        let t0 = Instant::now();
        import_api_document(&db, "p1", "json", &content, Some(&source)).unwrap();
        let elapsed = t0.elapsed();

        let after = counts(&db);
        let d = |k: &str| -> usize {
            after.get(k).copied().unwrap_or(0) - before.get(k).copied().unwrap_or(0)
        };
        let db_apis = d("apiDetail");
        let db_schemas = d("apiSchema");
        let db_folders = d("apiDetailFolder");

        let name = file
            .file_name()
            .unwrap()
            .to_string_lossy()
            .replace(".openapi.json", "");
        println!(
            "{:<28} {:>7} {:>7} {:>7} {:>7} {:>7} {:>7} {:>9?}",
            name,
            src_apis,
            db_apis,
            src_schemas,
            db_schemas,
            src_folders,
            db_folders,
            elapsed
        );

        totals.0 += src_apis;
        totals.1 += db_apis;
        totals.2 += src_schemas;
        totals.3 += db_schemas;
        totals.4 += src_folders;
        totals.5 += db_folders;
        if first_file.is_none() {
            first_file = Some(file.clone());
        }
    }

    println!(
        "{:<28} {:>7} {:>7} {:>7} {:>7} {:>7} {:>7}",
        "合计", totals.0, totals.1, totals.2, totals.3, totals.4, totals.5
    );

    // 幂等：把第一个项目再导一次，总数必须不变
    if let Some(file) = first_file {
        let content = std::fs::read_to_string(&file).unwrap();
        let source = file
            .file_name()
            .unwrap()
            .to_string_lossy()
            .replace(".openapi.json", "");
        let before = counts(&db);
        import_api_document(&db, "p1", "json", &content, Some(&source)).unwrap();
        let after = counts(&db);
        let mut same = true;
        for key in ["apiDetail", "apiDetailFolder", "apiSchema"] {
            let b = before.get(key).copied().unwrap_or(0);
            let a = after.get(key).copied().unwrap_or(0);
            if a != b {
                same = false;
                println!("幂等失败：{key} {b} -> {a}");
            }
        }
        println!("幂等检查：{}", if same { "通过（计数不变）" } else { "失败" });
    }
}
