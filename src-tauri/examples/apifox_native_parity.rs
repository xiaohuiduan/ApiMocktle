// 一次性对账工具（临时）：把 Apifox 原生格式导出用**真实导入代码路径**入库，
// 并逐项核对「源 → 入库」的数量，同时验证路径保真、重复接口、幂等性。
//
// 用法：cargo run --example apifox_native_parity -- <导出目录> <工作目录>
use std::collections::HashMap;
use std::path::PathBuf;

use apimocktle_lib::db::client::init_database;
use apimocktle_lib::services::import_service::import_api_document;
use serde_json::Value;

/// 源侧统计。
#[derive(Default, Clone)]
struct SourceStats {
    /// 接口数
    apis: usize,
    /// 目录节点数（含「根目录」）
    dirs: usize,
    /// 模型叶子数
    models: usize,
    /// 模型目录数（不含根）
    model_dirs: usize,
    /// 根目录直属项数（基线口径）
    model_root_items: usize,
    /// 路径里带 {{变量}} 的接口数
    var_paths: usize,
    /// 出现多次的 (method, path) 及其重复次数
    dup_paths: HashMap<(String, String), usize>,
}

fn source_stats(doc: &Value) -> SourceStats {
    let mut stats = SourceStats::default();

    fn walk_api(nodes: &[Value], stats: &mut SourceStats) {
        for node in nodes {
            if let Some(api) = node.get("api") {
                stats.apis += 1;
                let method = api
                    .get("method")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_uppercase();
                let path = api.get("path").and_then(|v| v.as_str()).unwrap_or("");
                if path.contains("{{") {
                    stats.var_paths += 1;
                }
                *stats
                    .dup_paths
                    .entry((method, path.to_string()))
                    .or_insert(0) += 1;
            } else {
                stats.dirs += 1;
            }
            if let Some(children) = node.get("items").and_then(|v| v.as_array()) {
                walk_api(children, stats);
            }
        }
    }

    fn walk_model(nodes: &[Value], stats: &mut SourceStats) {
        for node in nodes {
            if node
                .get("schema")
                .and_then(|s| s.get("jsonSchema"))
                .is_some()
            {
                stats.models += 1;
            } else if node.get("items").is_some() {
                stats.model_dirs += 1;
                if let Some(children) = node.get("items").and_then(|v| v.as_array()) {
                    walk_model(children, stats);
                }
            }
        }
    }

    if let Some(collection) = doc.get("apiCollection").and_then(|v| v.as_array()) {
        for root in collection {
            if let Some(items) = root.get("items").and_then(|v| v.as_array()) {
                walk_api(items, &mut stats);
            }
        }
    }

    if let Some(collection) = doc.get("schemaCollection").and_then(|v| v.as_array()) {
        for root in collection {
            let items = root.get("items").and_then(|v| v.as_array());
            stats.model_root_items = items.map(|i| i.len()).unwrap_or(0);
            if let Some(items) = items {
                walk_model(items, &mut stats);
            }
        }
    }

    stats
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

/// 入库接口的路径清单（用于核对 {{变量}} 与重复接口）。
fn db_paths(db: &apimocktle_lib::db::client::Db) -> Vec<(String, String, String)> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT COALESCE(json_extract(data_json, '$.method'), ''),
                    COALESCE(json_extract(data_json, '$.path'), ''),
                    COALESCE(json_extract(data_json, '$.source'), '')
             FROM menu_items WHERE type = 'apiDetail'",
        )
        .unwrap();
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .unwrap();
    rows.map(|r| r.unwrap()).collect()
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
             VALUES ('p1', 'apifox-native-parity', 'u1', '2026-01-01')",
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
        "{:<26} {:>6} {:>6} {:>6} {:>6} {:>6} {:>6} {:>6} {:>6}",
        "项目",
        "源接口",
        "库接口",
        "源目录",
        "库目录",
        "源模型",
        "库模型",
        "源模型目录",
        "库模型目录"
    );

    let mut totals = [0usize; 8];
    let mut src_var_total = 0usize;
    // 重复 method+path 跨项目也算（与库侧口径一致）
    let mut src_dup_pairs: HashMap<(String, String), usize> = HashMap::new();
    let mut problems: Vec<String> = vec![];
    let mut first_file: Option<PathBuf> = None;

    for file in &files {
        let content = std::fs::read_to_string(file).unwrap();
        let name = file
            .file_name()
            .unwrap()
            .to_string_lossy()
            .replace(".apifox.json", "");
        let source = name.clone();
        let doc: Value = serde_json::from_str(&content).unwrap();
        let src = source_stats(&doc);
        let before = counts(&db);

        import_api_document(&db, "p1", "json", &content, Some(&source)).unwrap();

        let after = counts(&db);
        let d = |k: &str| -> usize {
            after.get(k).copied().unwrap_or(0) - before.get(k).copied().unwrap_or(0)
        };
        let db_apis = d("apiDetail");
        let db_folders = d("apiDetailFolder");
        let db_models = d("apiSchema");
        let db_model_folders = d("apiSchemaFolder");

        // 源目录数不含「根目录」（根目录本身不落库）
        let src_dirs = src.dirs;
        if db_apis != src.apis {
            problems.push(format!("{name}: 接口数 {} -> {db_apis}", src.apis));
        }
        if db_folders != src_dirs {
            problems.push(format!("{name}: 目录数 {src_dirs} -> {db_folders}"));
        }
        if db_models != src.models {
            problems.push(format!("{name}: 模型数 {} -> {db_models}", src.models));
        }
        if db_model_folders != src.model_dirs {
            problems.push(format!(
                "{name}: 模型目录数 {} -> {db_model_folders}",
                src.model_dirs
            ));
        }

        println!(
            "{:<26} {:>6} {:>6} {:>6} {:>6} {:>6} {:>6} {:>6} {:>6}",
            name,
            src.apis,
            db_apis,
            src_dirs,
            db_folders,
            src.models,
            db_models,
            src.model_dirs,
            db_model_folders
        );

        src_var_total += src.var_paths;
        for (key, count) in &src.dup_paths {
            *src_dup_pairs.entry(key.clone()).or_insert(0) += count;
        }
        totals[0] += src.apis;
        totals[1] += db_apis;
        totals[2] += src_dirs;
        totals[3] += db_folders;
        totals[4] += src.models;
        totals[5] += db_models;
        totals[6] += src.model_dirs;
        totals[7] += db_model_folders;

        if first_file.is_none() {
            first_file = Some(file.clone());
        }
    }

    println!(
        "{:<26} {:>6} {:>6} {:>6} {:>6} {:>6} {:>6} {:>6} {:>6}",
        "合计",
        totals[0],
        totals[1],
        totals[2],
        totals[3],
        totals[4],
        totals[5],
        totals[6],
        totals[7]
    );

    // {{变量}} 路径是否原样保留
    let paths = db_paths(&db);
    let with_var = paths.iter().filter(|(_, p, _)| p.contains("{{")).count();
    println!("\n带 {{变量}} 的接口：源 {src_var_total} 个 → 入库 {with_var} 个");

    // 重复 method+path 是否都在
    let mut dup_count = 0usize;
    let mut seen: HashMap<(String, String), usize> = HashMap::new();
    for (m, p, _) in &paths {
        *seen.entry((m.clone(), p.clone())).or_insert(0) += 1;
    }
    for count in seen.values() {
        if *count > 1 {
            dup_count += count;
        }
    }
    let src_dup_total: usize = src_dup_pairs.values().filter(|c| **c > 1).sum();
    println!("重复 method+path 的接口：源 {src_dup_total} 个 → 入库 {dup_count} 个");

    // 幂等：再导一次第一个项目，总数必须不变
    if let Some(file) = first_file.clone() {
        let content = std::fs::read_to_string(&file).unwrap();
        let source = file
            .file_name()
            .unwrap()
            .to_string_lossy()
            .replace(".apifox.json", "");
        let before = counts(&db);
        import_api_document(&db, "p1", "json", &content, Some(&source)).unwrap();
        let after = counts(&db);
        let mut same = true;
        for key in [
            "apiDetail",
            "apiDetailFolder",
            "apiSchema",
            "apiSchemaFolder",
        ] {
            let b = before.get(key).copied().unwrap_or(0);
            let a = after.get(key).copied().unwrap_or(0);
            if a != b {
                same = false;
                println!("幂等失败：{key} {b} -> {a}");
            }
        }
        println!(
            "幂等检查：{}",
            if same {
                "通过（计数不变）"
            } else {
                "失败"
            }
        );
    }

    // 不同 source 导入同一份文档 → 互不覆盖
    if let Some(file) = first_file {
        let content = std::fs::read_to_string(&file).unwrap();
        let before = counts(&db);
        import_api_document(&db, "p1", "json", &content, Some("other-source")).unwrap();
        let after = counts(&db);
        let d = |k: &str| after.get(k).copied().unwrap_or(0) - before.get(k).copied().unwrap_or(0);
        println!(
            "不同 source 导入同一文档：新增接口 {} 个（应等于该文档接口数，不覆盖已有）",
            d("apiDetail")
        );
    }

    if problems.is_empty() {
        println!("\n对账：全部一致");
    } else {
        println!("\n对账差异：");
        for p in &problems {
            println!("  {p}");
        }
    }
}
