use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use rand::Rng;
use regex::Regex;
use rhai::Dynamic;
use uuid::Uuid;

use crate::db::client::Db;
use crate::errors::AppError;
use crate::models::{ResolvedField, ResolvedVar, ScriptTestResult};

/// 模板匹配：兼容无参（{{$timestamp}}）、带参（{{$randomInt(1,100)}}）、前缀（{{$processEnv:HOME}}）。
/// 注意 `.` 不匹配 `\r`，CRLF 行尾下 `[^)]*` 不受影响；`[\w:.]` 覆盖冒号与点。
const PLACEHOLDER_RE: &str = r"\{\{(\$[\w:.]+(?:\([^)]*\))?)\}\}";

/// static 递归替换最大深度（防循环引用）
const MAX_STATIC_DEPTH: usize = 3;

/// print 输出捕获缓冲。仅在 exec_lock 内读写，不会串台。
static PRINT_BUFFER: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// 变量定义（引擎内部缓存用）
#[derive(Clone)]
pub struct VarDef {
    pub var_type: String,
    pub value: String,
}

pub struct DynamicVarEngine {
    engine: rhai::Engine,
    /// 脚本源码 → 编译后 AST 缓存
    script_cache: Mutex<HashMap<String, std::sync::Arc<rhai::AST>>>,
    /// 变量定义缓存（name → def），DB 变更后 refresh
    defs: Mutex<HashMap<String, VarDef>>,
    /// 脚本执行串行锁：保证 print 捕获不串台
    exec_lock: Mutex<()>,
}

static ENGINE: OnceLock<DynamicVarEngine> = OnceLock::new();

fn random_string_impl(len: usize) -> String {
    let mut rng = rand::thread_rng();
    (0..len)
        .map(|_| {
            let c = rng.gen_range(b'a'..=b'z');
            (if rng.gen_bool(0.5) { c.to_ascii_uppercase() } else { c }) as char
        })
        .collect()
}

fn register_functions(engine: &mut rhai::Engine) {
    engine.register_fn("timestamp", || chrono::Utc::now().timestamp().to_string());
    engine.register_fn("timestamp_iso", || {
        // 与 JS toISOString 对齐：UTC + 毫秒 + Z 后缀（chrono 默认输出 +00:00）
        chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
    });
    engine.register_fn("guid", || Uuid::new_v4().to_string());
    engine.register_fn("random_uuid", || Uuid::new_v4().simple().to_string());
    engine.register_fn("random_int", || rand::thread_rng().gen_range(0..=1000) as i64);
    engine.register_fn("random_int", |min: i64, max: i64| rand::thread_rng().gen_range(min..=max));
    engine.register_fn("random_email", || {
        let local: String = (0..8).map(|_| rand::thread_rng().gen_range(b'a'..=b'z') as char).collect();
        format!("{local}@example.com")
    });
    engine.register_fn("random_ip", || {
        format!(
            "{}.{}.{}.{}",
            rand::thread_rng().gen_range(1..=255),
            rand::thread_rng().gen_range(0..=255),
            rand::thread_rng().gen_range(0..=255),
            rand::thread_rng().gen_range(1..=255)
        )
    });
    engine.register_fn("random_mobile", || {
        let prefix = rand::thread_rng().gen_range(130..=199);
        let tail: String = (0..8).map(|_| rand::thread_rng().gen_range(b'0'..=b'9') as char).collect();
        format!("{prefix}{tail}")
    });
    engine.register_fn("random_string", || random_string_impl(8));
    engine.register_fn("random_string", |len: i64| random_string_impl(len.max(0) as usize));
    engine.register_fn("env", |key: &str| std::env::var(key).unwrap_or_default());
}

impl DynamicVarEngine {
    pub fn instance() -> &'static Self {
        ENGINE.get_or_init(|| {
            let mut engine = rhai::Engine::new();
            register_functions(&mut engine);
            // 输出缓冲为独立 static，避免闭包依赖 ENGINE 导致初始化期 panic
            engine.on_print(|s: &str| PRINT_BUFFER.lock().unwrap().push(s.to_string()));
            DynamicVarEngine {
                engine,
                script_cache: Mutex::new(HashMap::new()),
                defs: Mutex::new(HashMap::new()),
                exec_lock: Mutex::new(()),
            }
        })
    }

    /// 从 DB 加载定义缓存（seed + 自定义，仅启用项）
    pub fn refresh_defs(&self, db: &Db) -> Result<(), AppError> {
        let defs = crate::db::dynamic_variables_repo::list(db)?
            .into_iter()
            .filter(|d| d.enabled)
            .map(|d| {
                (
                    d.name.clone(),
                    VarDef { var_type: d.var_type, value: d.value },
                )
            })
            .collect::<HashMap<_, _>>();
        *self.defs.lock().unwrap() = defs;
        Ok(())
    }

    fn lookup_def(&self, name: &str) -> Option<VarDef> {
        self.defs.lock().unwrap().get(name).cloned()
    }

    /// 求值单个变量（同一次 resolve_field 内同名同参只求一次，保证请求内一致性）
    fn eval_var(
        &self,
        name: &str,
        args: Option<&str>,
        depth: usize,
        cache: &mut HashMap<(String, String), String>,
        errors: &mut Vec<String>,
    ) -> Option<String> {
        // $processEnv:KEY / $processEnv.KEY 前缀特判（不入库）
        let env_key = name
            .strip_prefix("$processEnv:")
            .or_else(|| name.strip_prefix("$processEnv."));
        if let Some(key) = env_key {
            return Some(std::env::var(key).unwrap_or_default());
        }

        let cache_key = (name.to_string(), args.unwrap_or("").to_string());
        if let Some(v) = cache.get(&cache_key) {
            return Some(v.clone());
        }

        let def = self.lookup_def(name);
        let result = match def {
            None => None,
            Some(def) => match def.var_type.as_str() {
                "static" => Some(self.resolve_static(&def.value, depth, cache, errors)),
                "expression" => self.eval_expression(&def.value, args, errors),
                "script" => self.eval_script(&def.value, errors),
                other => {
                    errors.push(format!("{{{{{name}}}}}: 未知类型 {other}"));
                    None
                }
            },
        };

        if let Some(ref v) = result {
            cache.insert(cache_key, v.clone());
        }
        result
    }

    /// static：值作模板递归替换（深度 ≤ MAX_STATIC_DEPTH）
    fn resolve_static(
        &self,
        template: &str,
        depth: usize,
        cache: &mut HashMap<(String, String), String>,
        errors: &mut Vec<String>,
    ) -> String {
        if depth >= MAX_STATIC_DEPTH || !template.contains("{{") {
            return template.to_string();
        }
        self.resolve_template_impl(template, depth, cache, errors)
    }

    fn eval_expression(&self, func: &str, args: Option<&str>, errors: &mut Vec<String>) -> Option<String> {
        let expr = match args {
            Some(a) if !a.trim().is_empty() => format!("{func}({a})"),
            _ => format!("{func}()"),
        };
        match self.engine.eval::<Dynamic>(&expr) {
            Ok(v) => Some(dynamic_to_string(v)),
            Err(e) => {
                errors.push(format!("{expr}: {e}"));
                None
            }
        }
    }

    fn eval_script(&self, source: &str, errors: &mut Vec<String>) -> Option<String> {
        let ast = {
            let mut cache = self.script_cache.lock().unwrap();
            if let Some(a) = cache.get(source) {
                a.clone()
            } else {
                match self.engine.compile(source) {
                    Ok(a) => {
                        let arc = std::sync::Arc::new(a);
                        cache.insert(source.to_string(), arc.clone());
                        arc
                    }
                    Err(e) => {
                        errors.push(format!("{e}"));
                        return None;
                    }
                }
            }
        };
        match self.engine.eval_ast::<Dynamic>(&ast) {
            Ok(v) => Some(dynamic_to_string(v)),
            Err(e) => {
                errors.push(format!("{e}"));
                None
            }
        }
    }

    /// 模板求值（static 递归的公共路径；depth 为当前层，内层 eval_var 递进）
    fn resolve_template_impl(
        &self,
        text: &str,
        depth: usize,
        cache: &mut HashMap<(String, String), String>,
        errors: &mut Vec<String>,
    ) -> String {
        let re = Regex::new(PLACEHOLDER_RE).expect("静态正则");
        let mut result = text.to_string();
        // 逆序替换避免偏移错乱
        let matches: Vec<(usize, usize, String)> = re
            .find_iter(text)
            .map(|m| (m.start(), m.end(), m.as_str().to_string()))
            .collect();

        for (start, end, full) in matches.into_iter().rev() {
            let inner = &full[2..full.len() - 2]; // 去掉 {{ }}
            let (name, args) = split_name_args(inner);
            let value = self.eval_var(&name, args.as_deref(), depth + 1, cache, errors);
            if let Some(v) = value {
                result.replace_range(start..end, &v);
            }
        }
        result
    }

    /// 求值单个字段：返回替换后文本 + 变量位置映射（字符偏移）+ 诊断。
    /// 整体持 exec_lock：脚本串行执行，print 输出不串台。
    pub fn resolve_field(&self, text: &str) -> ResolvedField {
        let _guard = self.exec_lock.lock().unwrap();
        PRINT_BUFFER.lock().unwrap().clear();
        let re = Regex::new(PLACEHOLDER_RE).expect("静态正则");
        let mut cache: HashMap<(String, String), String> = HashMap::new();
        let mut errors: Vec<String> = Vec::new();

        let mut result = text.to_string();
        let mut vars: Vec<ResolvedVar> = Vec::new();

        let matches: Vec<(usize, usize, String)> = re
            .find_iter(text)
            .map(|m| (m.start(), m.end(), m.as_str().to_string()))
            .collect();

        for (start, end, full) in matches.into_iter().rev() {
            let inner = &full[2..full.len() - 2];
            let (name, args) = split_name_args(inner);
            let value = self.eval_var(&name, args.as_deref(), 0, &mut cache, &mut errors);
            if let Some(v) = value {
                // 字节偏移 → 字符偏移（前端按 char 索引渲染）
                let start_chars = text[..start].chars().count();
                let end_chars = text[..end].chars().count();
                vars.push(ResolvedVar { name, value: v.clone(), start: start_chars, end: end_chars });
                result.replace_range(start..end, &v);
            }
        }

        vars.reverse(); // 逆序处理过，恢复正序
        ResolvedField { resolved: result, vars, errors }
    }

    /// 脚本试运行（不落库、不进 AST 缓存）
    pub fn test_script(&self, script: &str) -> ScriptTestResult {
        let _guard = self.exec_lock.lock().unwrap();
        PRINT_BUFFER.lock().unwrap().clear();
        let result = self.engine.eval::<Dynamic>(script);
        let output = PRINT_BUFFER.lock().unwrap().join("\n");
        match result {
            Ok(v) => ScriptTestResult { output, result: dynamic_to_string(v), error: None },
            Err(e) => ScriptTestResult { output, result: String::new(), error: Some(e.to_string()) },
        }
    }
}

/// "name(args)" 拆分为变量名与参数串
fn split_name_args(inner: &str) -> (String, Option<String>) {
    match inner.find('(') {
        Some(idx) if inner.ends_with(')') => {
            (inner[..idx].to_string(), Some(inner[idx + 1..inner.len() - 1].to_string()))
        }
        _ => (inner.to_string(), None),
    }
}

fn dynamic_to_string(v: Dynamic) -> String {
    v.to_string()
}

/// 便捷入口：给测试引擎等 Rust 侧调用（与 IPC 同一实现）
pub fn resolve_field(text: &str) -> ResolvedField {
    DynamicVarEngine::instance().resolve_field(text)
}

pub fn refresh_defs(db: &Db) -> Result<(), AppError> {
    DynamicVarEngine::instance().refresh_defs(db)
}

/// 引擎为全局单例（defs/缓存共享），动态变量相关测试必须串行执行。
/// 测试专用（cfg(test)）：dynamic_variables 与 test_engine 模块共用同一把锁。
#[cfg(test)]
pub static TEST_LOCK: Mutex<()> = Mutex::new(());

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::dynamic_variables_repo;
    use rusqlite::Connection;
    fn test_db() -> Db {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE dynamic_variables (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                var_type TEXT NOT NULL,
                value TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                is_builtin INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );",
        )
        .unwrap();
        let db = Db(std::sync::Mutex::new(conn));
        dynamic_variables_repo::ensure_seed(&db).unwrap();
        db
    }

    fn engine_with_defs(db: &Db) -> &'static DynamicVarEngine {
        let engine = DynamicVarEngine::instance();
        engine.refresh_defs(db).unwrap();
        engine
    }

    #[test]
    fn builtin_no_args() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let db = test_db();
        let engine = engine_with_defs(&db);

        let r = engine.resolve_field("t={{$timestamp}}");
        assert!(r.resolved.starts_with("t=") && r.resolved.len() > 3);
        assert_eq!(r.vars.len(), 1);
        assert_eq!(r.vars[0].name, "$timestamp");
        assert_eq!(r.vars[0].start, 2);
        assert_eq!(r.vars[0].end, 2 + "$timestamp".len() + 4);

        let iso = engine.resolve_field("{{$timestampISO}}");
        assert!(iso.resolved.contains('T') && iso.resolved.ends_with('Z'));

        let guid = engine.resolve_field("{{$guid}}");
        assert_eq!(guid.resolved.len(), 36);

        let uuid = engine.resolve_field("{{$randomUUID}}");
        assert_eq!(uuid.resolved.len(), 32);

        let email = engine.resolve_field("{{$randomEmail}}");
        assert!(email.resolved.ends_with("@example.com"));
    }

    #[test]
    fn builtin_with_args() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let db = test_db();
        let engine = engine_with_defs(&db);

        let r = engine.resolve_field("{{$randomInt(1,100)}}");
        let v: i64 = r.resolved.parse().unwrap();
        assert!((1..=100).contains(&v));

        let s = engine.resolve_field("{{$randomString(4)}}");
        assert_eq!(s.resolved.len(), 4);

        // 无参默认值
        let ri = engine.resolve_field("{{$randomInt}}");
        let v: i64 = ri.resolved.parse().unwrap();
        assert!((0..=1000).contains(&v));
    }

    #[test]
    fn process_env_prefix() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let db = test_db();
        let engine = engine_with_defs(&db);
        std::env::set_var("APIMOCKTLE_TEST_VAR", "hello-env");
        let r = engine.resolve_field("{{$processEnv:APIMOCKTLE_TEST_VAR}}");
        assert_eq!(r.resolved, "hello-env");
        let r2 = engine.resolve_field("{{$processEnv.APIMOCKTLE_TEST_VAR}}");
        assert_eq!(r2.resolved, "hello-env");
    }

    #[test]
    fn unknown_kept_as_is() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let db = test_db();
        let engine = engine_with_defs(&db);
        let r = engine.resolve_field("a{{$notExist}}b");
        assert_eq!(r.resolved, "a{{$notExist}}b");
        assert!(r.vars.is_empty());
    }

    #[test]
    fn same_var_same_value_in_field() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let db = test_db();
        let engine = engine_with_defs(&db);
        let r = engine.resolve_field("{{$randomInt(1,1000000)}}-{{$randomInt(1,1000000)}}");
        let parts: Vec<&str> = r.resolved.split('-').collect();
        // 同一字段内同名同参只求值一次
        assert_eq!(parts[0], parts[1]);
        assert_eq!(r.vars.len(), 2);
        assert_eq!(r.vars[0].value, r.vars[1].value);
    }

    #[test]
    fn static_recursive_and_cycle_guard() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let engine = DynamicVarEngine::instance();
        // 静态变量引用其他变量
        let defs = vec![
            ("$greet".to_string(), VarDef { var_type: "static".into(), value: "hello {{$who}}".into() }),
            ("$who".to_string(), VarDef { var_type: "static".into(), value: "world".into() }),
        ]
        .into_iter()
        .collect::<HashMap<_, _>>();
        *engine.defs.lock().unwrap() = defs;
        let r = engine.resolve_field("{{$greet}}!");
        assert_eq!(r.resolved, "hello world!");

        // 循环引用不栈溢出（深度 3 展开三层）
        let defs = vec![
            ("$a".to_string(), VarDef { var_type: "static".into(), value: "x{{$b}}".into() }),
            ("$b".to_string(), VarDef { var_type: "static".into(), value: "y{{$a}}".into() }),
        ]
        .into_iter()
        .collect::<HashMap<_, _>>();
        *engine.defs.lock().unwrap() = defs;
        let r = engine.resolve_field("{{$a}}");
        assert_eq!(r.resolved, "xyxy{{$a}}");
    }

    #[test]
    fn script_output_and_result() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let db = test_db();
        let engine = DynamicVarEngine::instance();
        let defs = vec![(
            "$scripted".to_string(),
            VarDef { var_type: "script".into(), value: "let x = 21; print(`x=$x`); x * 2".into() },
        )]
        .into_iter()
        .collect::<HashMap<_, _>>();
        *engine.defs.lock().unwrap() = defs;
        let r = engine.resolve_field("{{$scripted}}");
        assert_eq!(r.resolved, "42");
        // 恢复 defs
        engine_with_defs(&db);
    }

    #[test]
    fn script_error_reported_and_kept() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let db = test_db();
        let engine = DynamicVarEngine::instance();
        let defs = vec![(
            "$bad".to_string(),
            VarDef { var_type: "script".into(), value: "if (".into() },
        )]
        .into_iter()
        .collect::<HashMap<_, _>>();
        *engine.defs.lock().unwrap() = defs;
        let r = engine.resolve_field("{{$bad}}");
        assert_eq!(r.resolved, "{{$bad}}");
        assert_eq!(r.errors.len(), 1);
        engine_with_defs(&db);
    }

    #[test]
    fn test_script_manual() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let engine = DynamicVarEngine::instance();
        let r = engine.test_script("print(\"hi\"); 1 + 2");
        assert_eq!(r.output, "hi");
        assert_eq!(r.result, "3");
        assert!(r.error.is_none());

        let bad = engine.test_script("syntax error here !!!");
        assert!(bad.error.is_some());
    }

    #[test]
    fn char_offset_with_chinese() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let db = test_db();
        let engine = engine_with_defs(&db);
        let r = engine.resolve_field("前缀{{$timestamp}}后缀");
        assert_eq!(r.vars.len(), 1);
        assert_eq!(r.vars[0].start, 2); // "前缀" 两个字符
        assert_eq!(r.vars[0].end, 2 + "$timestamp".len() + 4);
    }

    #[test]
    fn disabled_var_kept() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let db = test_db();
        let engine = DynamicVarEngine::instance();
        let defs = HashMap::new();
        *engine.defs.lock().unwrap() = defs;
        let r = engine.resolve_field("{{$timestamp}}");
        assert_eq!(r.resolved, "{{$timestamp}}");
        engine_with_defs(&db);
    }
}
