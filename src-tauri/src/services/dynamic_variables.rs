use std::collections::HashMap;
use std::sync::Mutex;

use rand::Rng;
use regex::Regex;
use rquickjs::prelude::Opt;
use rquickjs::CatchResultExt;
use rquickjs::{Array, Context, Function, Runtime, Value};
use uuid::Uuid;

use crate::db::client::Db;
use crate::errors::AppError;
use crate::models::{ResolvedField, ResolvedVar, ScriptTestResult};

/// 模板匹配：兼容无参（{{$timestamp}}）、带参（{{$randomInt(1,100)}}）、前缀（{{$processEnv:HOME}}）。
/// 注意 `.` 不匹配 `\r`，CRLF 行尾下 `[^)]*` 不受影响；`[\w:.]` 覆盖冒号与点。
const PLACEHOLDER_RE: &str = r"\{\{(\$[\w:.]+(?:\([^)]*\))?)\}\}";

/// print/console.log 输出捕获缓冲。仅在 exec_lock 内读写，不会串台。
static PRINT_BUFFER: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// 变量定义（引擎内部缓存用）
#[derive(Clone)]
pub struct VarDef {
    pub var_type: String,
    pub value: String,
}

/// 模板参数解析结果（数字/字符串；注入为 JS args 数组元素）
enum ArgVal {
    Num(f64),
    Str(String),
}

/// 模板参数串 → 参数列表："1,100" → [Num(1), Num(100)]；"abc" → [Str("abc")]；空 → []
fn parse_args(args: Option<&str>) -> Vec<ArgVal> {
    let Some(a) = args else { return Vec::new() };
    a.split(',')
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .map(|p| {
            if let Ok(n) = p.parse::<f64>() {
                ArgVal::Num(n)
            } else {
                ArgVal::Str(p.to_string())
            }
        })
        .collect()
}

/// QuickJS 旧版编译 bug 规避：多行脚本中「非首行」的模板字符串，其插值表达式会编译错位
/// （运行时 "not a function" / "x is not initialized"，与变量引用无关，属编译层缺陷且引擎
/// 无法升级）。预处理把代码环境中的换行替换为 `;`（ASI 下语义等价），使整个脚本压成
/// 单行编译；模板字符串内容中的换行属字符串内容，原样保留；字符串字面量与注释原样保留。
///
/// 已知边界（生成器脚本极少用到）：模板插值内以对象字面量开头的 `${{a:1}}` 会提前闭合
/// 插值；正则字面量以 `//` 或 `/*` 开头会被误判为注释；依赖 ASI 的 `a\n(b)` 调用写法会
/// 被拆成两条语句。均属不推荐写法。
fn flatten_newlines(src: &str) -> String {
    #[derive(Clone, Copy, PartialEq)]
    enum Frame {
        Code,
        /// 模板字符串；brace=0 表示内容态，>0 表示处于第几层 `${...}` 插值表达式内
        Tpl { brace: usize },
    }

    let mut stack: Vec<Frame> = vec![Frame::Code];
    let mut quote: Option<char> = None; // ' 或 " 字符串字面量
    let mut in_line_comment = false;
    let mut in_block_comment = false;
    let mut out = String::with_capacity(src.len() + 8);
    let mut it = src.chars().peekable();
    while let Some(c) = it.next() {
        let frame = *stack.last().unwrap();
        // 代码环境：顶层，或模板插值表达式内（brace > 0）
        let in_code =
            frame == Frame::Code || matches!(frame, Frame::Tpl { brace } if brace > 0);
        // 模板内容态
        let in_tpl_content = matches!(frame, Frame::Tpl { brace: 0 });

        if in_line_comment {
            if c == '\n' {
                in_line_comment = false;
                out.push(';');
            }
            continue;
        }
        if in_block_comment {
            out.push(c);
            if c == '*' && it.peek() == Some(&'/') {
                out.push('/');
                it.next();
                in_block_comment = false;
            }
            continue;
        }
        if let Some(q) = quote {
            out.push(c);
            if c == '\\' {
                if let Some(&n) = it.peek() {
                    out.push(n);
                    it.next();
                }
            } else if c == q {
                quote = None;
            }
            continue;
        }
        if in_code {
            match c {
                '\n' => out.push(';'),
                '\'' | '"' => {
                    quote = Some(c);
                    out.push(c);
                }
                '`' => {
                    stack.push(Frame::Tpl { brace: 0 });
                    out.push(c);
                }
                '/' if it.peek() == Some(&'/') => in_line_comment = true,
                '/' if it.peek() == Some(&'*') => {
                    in_block_comment = true;
                    out.push('/');
                    out.push('*');
                    it.next();
                }
                '{' if frame != Frame::Code => {
                    if let Frame::Tpl { brace } = stack.last_mut().unwrap() {
                        *brace += 1;
                    }
                    out.push(c);
                }
                '}' if frame != Frame::Code => {
                    if let Frame::Tpl { brace } = stack.last_mut().unwrap() {
                        *brace = brace.saturating_sub(1);
                    }
                    out.push(c);
                }
                _ => out.push(c),
            }
        } else if in_tpl_content {
            out.push(c);
            if c == '\\' {
                if let Some(&n) = it.peek() {
                    out.push(n);
                    it.next();
                }
            } else if c == '`' {
                stack.pop();
            } else if c == '$' && it.peek() == Some(&'{') {
                // 通用 out.push(c) 已输出 '$'，这里只补 '{' 并进入插值态
                out.push('{');
                it.next();
                if let Frame::Tpl { brace } = stack.last_mut().unwrap() {
                    *brace = 1;
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

fn random_string_impl(len: usize) -> String {
    let mut rng = rand::thread_rng();
    (0..len)
        .map(|_| {
            let c = rng.gen_range(b'a'..=b'z');
            (if rng.gen_bool(0.5) { c.to_ascii_uppercase() } else { c }) as char
        })
        .collect()
}

/// 内置函数注册为 JS 全局函数（QuickJS 宿主提供原语，脚本自由组合）。
/// 可选参数用 Option<T>（JS undefined → None）。
fn register_functions(ctx: rquickjs::Ctx<'_>) -> rquickjs::Result<()> {
    let globals = ctx.clone().globals();
    globals.set("timestamp", Function::new(ctx.clone(), || chrono::Utc::now().timestamp().to_string())?)?;
    globals.set("timestamp_iso", Function::new(ctx.clone(), || {
        // 与 JS toISOString 对齐：UTC + 毫秒 + Z 后缀
        chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
    })?)?;
    globals.set("guid", Function::new(ctx.clone(), || Uuid::new_v4().to_string())?)?;
    globals.set("random_uuid", Function::new(ctx.clone(), || Uuid::new_v4().simple().to_string())?)?;
    globals.set("random_int", Function::new(ctx.clone(), |a: Opt<i64>, b: Opt<i64>| -> i64 {
        match (a.0, b.0) {
            (Some(x), Some(y)) => rand::thread_rng().gen_range(x..=y),
            _ => rand::thread_rng().gen_range(0..=1000),
        }
    })?)?;
    globals.set("random_email", Function::new(ctx.clone(), || {
        let local: String = (0..8).map(|_| rand::thread_rng().gen_range(b'a'..=b'z') as char).collect();
        format!("{local}@example.com")
    })?)?;
    globals.set("random_ip", Function::new(ctx.clone(), || {
        format!(
            "{}.{}.{}.{}",
            rand::thread_rng().gen_range(1..=255),
            rand::thread_rng().gen_range(0..=255),
            rand::thread_rng().gen_range(0..=255),
            rand::thread_rng().gen_range(1..=255)
        )
    })?)?;
    globals.set("random_mobile", Function::new(ctx.clone(), || {
        let prefix = rand::thread_rng().gen_range(130..=199);
        let tail: String = (0..8).map(|_| rand::thread_rng().gen_range(b'0'..=b'9') as char).collect();
        format!("{prefix}{tail}")
    })?)?;
    globals.set("random_string", Function::new(ctx.clone(), |len: Opt<i64>| {
        random_string_impl(len.0.unwrap_or(8).max(0) as usize)
    })?)?;
    globals.set("env", Function::new(ctx.clone(), |key: String| std::env::var(key).unwrap_or_default())?)?;

    // print / console.log 输出捕获（JS 习惯写法直接可用）
    // console.log 用 JS 包装：可变参数、String() 转换后拼接（console.log(123) / console.log("a", 1) 均不报错）
    let print_fn = Function::new(ctx.clone(), |s: String| {
        PRINT_BUFFER.lock().unwrap().push(s);
    })?;
    globals.set("print", print_fn.clone())?;
    globals.set("__apiPrint", print_fn)?;
    ctx.eval::<(), &str>(
        "globalThis.console = { log: (...args) => __apiPrint(args.map(a => String(a)).join(' ')) };",
    )?;
    Ok(())
}

pub struct DynamicVarEngine {
    /// QuickJS 运行时（非 Send/Sync，仅限本线程使用）；每次执行新建 Context 隔离全局作用域
    runtime: Runtime,
    /// 变量定义缓存（name → def），DB 变更后 refresh
    defs: Mutex<HashMap<String, VarDef>>,
    /// 脚本执行串行锁：保证 print 捕获不串台、Context 独占
    exec_lock: Mutex<()>,
}

// 线程本地引擎单例（Runtime 非 Send/Sync，每个线程独立实例；脚本短、编译快，无需跨线程共享）
thread_local! {
    static ENGINE: std::cell::RefCell<Option<DynamicVarEngine>> = const { std::cell::RefCell::new(None) };
}

/// 在线程本地引擎上执行闭包（懒初始化；失败返回引擎创建错误）
pub fn with_engine<T>(f: impl FnOnce(&DynamicVarEngine) -> T) -> Result<T, AppError> {
    ENGINE.with(|cell| {
        let mut opt = cell.borrow_mut();
        if opt.is_none() {
            *opt = Some(DynamicVarEngine::new()?);
        }
        Ok(f(opt.as_ref().expect("已初始化")))
    })
}

impl DynamicVarEngine {
    fn new() -> Result<Self, AppError> {
        let runtime = Runtime::new()
            .map_err(|e| AppError::Internal(format!("QuickJS 运行时创建失败: {e}")))?;
        Ok(DynamicVarEngine {
            runtime,
            defs: Mutex::new(HashMap::new()),
            exec_lock: Mutex::new(()),
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
            Some(def) if def.var_type == "script" => self.eval_script(&def.value, args, errors),
            Some(def) => {
                errors.push(format!("{{{{{name}}}}}: 未知类型 {}", def.var_type));
                None
            }
        };

        if let Some(ref v) = result {
            cache.insert(cache_key, v.clone());
        }
        result
    }

    /// 脚本执行（唯一变量类型）。模板参数 {{$xxx(1,2)}} 注入为 JS 全局数组 args（args[0]/args[1]；
    /// 无参时为空数组，脚本可用 args.length 判断）。
    /// 每次执行新建 Context：隔离全局作用域（const/let 不跨执行污染，避免 redeclaration），
    /// 直接 eval 保留「最后表达式即结果」语义；执行前压平换行规避 QuickJS 多行模板编译 bug。
    fn eval_script(&self, source: &str, args: Option<&str>, errors: &mut Vec<String>) -> Option<String> {
        let _guard = self.exec_lock.lock().unwrap();
        PRINT_BUFFER.lock().unwrap().clear();
        let result = (|| -> Result<String, String> {
            let ctx = Context::full(&self.runtime).map_err(|e| e.to_string())?;
            ctx.with(|ctx| -> Result<String, String> {
                register_functions(ctx.clone()).map_err(|e| e.to_string())?;
                let arr = Array::new(ctx.clone()).map_err(|e| e.to_string())?;
                for (i, v) in parse_args(args).iter().enumerate() {
                    match v {
                        ArgVal::Num(n) => arr.set(i, *n).map_err(|e| e.to_string())?,
                        ArgVal::Str(s) => arr.set(i, s.as_str()).map_err(|e| e.to_string())?,
                    }
                }
                ctx.globals().set("args", arr).map_err(|e| e.to_string())?;
                // 真实异常消息（CaughtError 的 Display 即 JS 错误文本）
                let value: Value = ctx
                    .eval(flatten_newlines(source))
                    .catch(&ctx)
                    .map_err(|exc| exc.to_string())?;
                // JS 语义 String(value)：数字/布尔/对象统一转字符串
                let string_fn: Function = ctx.globals().get("String").map_err(|e| e.to_string())?;
                let s: String = string_fn.call((value,)).map_err(|e| e.to_string())?;
                Ok(s)
            })
        })();
        match result {
            Ok(s) => Some(s),
            Err(e) => {
                errors.push(format!("{e}"));
                None
            }
        }
    }

    /// 求值单个字段：返回替换后文本 + 变量位置映射（字符偏移）+ 诊断。
    pub fn resolve_field(&self, text: &str) -> ResolvedField {
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
            let value = self.eval_var(&name, args.as_deref(), &mut cache, &mut errors);
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

    /// 脚本试运行（不落库）。与变量求值一致：参数注入 args 数组（无参注入空数组）。
    pub fn test_script(&self, script: &str, args: Option<&str>) -> ScriptTestResult {
        let _guard = self.exec_lock.lock().unwrap();
        PRINT_BUFFER.lock().unwrap().clear();
        let result = (|| -> Result<String, String> {
            let ctx = Context::full(&self.runtime).map_err(|e| e.to_string())?;
            ctx.with(|ctx| -> Result<String, String> {
                register_functions(ctx.clone()).map_err(|e| e.to_string())?;
                let arr = Array::new(ctx.clone()).map_err(|e| e.to_string())?;
                for (i, v) in parse_args(args).iter().enumerate() {
                    match v {
                        ArgVal::Num(n) => arr.set(i, *n).map_err(|e| e.to_string())?,
                        ArgVal::Str(s) => arr.set(i, s.as_str()).map_err(|e| e.to_string())?,
                    }
                }
                ctx.globals().set("args", arr).map_err(|e| e.to_string())?;
                let value: Value = ctx
                    .eval(flatten_newlines(script))
                    .catch(&ctx)
                    .map_err(|exc| exc.to_string())?;
                // JS 语义 String(value)：数字/布尔/对象统一转字符串
                let string_fn: Function = ctx.globals().get("String").map_err(|e| e.to_string())?;
                let s: String = string_fn.call((value,)).map_err(|e| e.to_string())?;
                Ok(s)
            })
        })();
        let output = PRINT_BUFFER.lock().unwrap().join("\n");
        match result {
            Ok(s) => ScriptTestResult { output, result: s, error: None },
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

/// 便捷入口：给测试引擎等 Rust 侧调用（与 IPC 同一实现）
pub fn resolve_field(text: &str) -> ResolvedField {
    match with_engine(|e| e.resolve_field(text)) {
        Ok(field) => field,
        Err(e) => ResolvedField {
            resolved: text.to_string(),
            vars: Vec::new(),
            errors: vec![format!("动态变量引擎初始化失败: {e}")],
        },
    }
}

pub fn refresh_defs(db: &Db) -> Result<(), AppError> {
    with_engine(|e| e.refresh_defs(db))?
}

/// 引擎为线程本地单例（defs 共享），动态变量相关测试必须串行执行。
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

    /// 测试直接构造引擎实例（不走线程本地单例，互不干扰）
    fn engine_with_defs(db: &Db) -> DynamicVarEngine {
        let engine = DynamicVarEngine::new().expect("引擎初始化");
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
    fn script_args_injection() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let db = test_db();
        let mut engine = engine_with_defs(&db);
        // 脚本内通过全局 args 数组读取模板参数（JS 语法）
        let defs = vec![
            ("$echo".to_string(), VarDef { var_type: "script".into(), value: "`${args[0]}-${args[1]}`".into() }),
            ("$sum".to_string(), VarDef { var_type: "script".into(), value: "args[0] + args[1]".into() }),
            ("$greet".to_string(), VarDef { var_type: "script".into(), value: "`hello ${args[0]}`".into() }),
        ]
        .into_iter()
        .collect::<HashMap<_, _>>();
        *engine.defs.lock().unwrap() = defs;

        // 数字参数
        let r = engine.resolve_field("{{$echo(1,100)}}");
        assert_eq!(r.resolved, "1-100");

        // 数值计算
        let r = engine.resolve_field("{{$sum(20,22)}}");
        assert_eq!(r.resolved, "42");

        // 字符串参数（自动转 JS 字符串）
        let r = engine.resolve_field("{{$greet(world)}}");
        assert_eq!(r.resolved, "hello world");
    }

    #[test]
    fn script_args_absent_keeps_script_runnable() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let db = test_db();
        let mut engine = engine_with_defs(&db);
        let defs = vec![(
            "$noarg".to_string(),
            VarDef { var_type: "script".into(), value: "1 + 1".into() },
        )]
        .into_iter()
        .collect::<HashMap<_, _>>();
        *engine.defs.lock().unwrap() = defs;
        // 无参时脚本原样执行
        let r = engine.resolve_field("{{$noarg}}");
        assert_eq!(r.resolved, "2");
        assert!(r.errors.is_empty());
    }

    #[test]
    fn script_output_and_result() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let db = test_db();
        let mut engine = engine_with_defs(&db);
        let defs = vec![(
            "$scripted".to_string(),
            VarDef { var_type: "script".into(), value: "let x = 21; print(`x=${x}`); x * 2".into() },
        )]
        .into_iter()
        .collect::<HashMap<_, _>>();
        *engine.defs.lock().unwrap() = defs;
        let r = engine.resolve_field("{{$scripted}}");
        assert_eq!(r.resolved, "42");
    }

    #[test]
    fn script_error_reported_and_kept() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let db = test_db();
        let mut engine = engine_with_defs(&db);
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
    }

    #[test]
    fn test_script_manual() {
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let engine = DynamicVarEngine::new().expect("引擎初始化");
        let r = engine.test_script("print(\"hi\"); 1 + 2", None);
        assert_eq!(r.output, "hi");
        assert_eq!(r.result, "3");
        assert!(r.error.is_none());

        // console.log 多参/数字参数（JS 包装：String() 转换后拼接）
        let cl = engine.test_script("console.log(123); console.log(\"a\", 1); 1", None);
        assert!(cl.error.is_none(), "console.log 报错: {:?}", cl.error);
        assert_eq!(cl.output, "123
a 1");

        let bad = engine.test_script("syntax error here !!!", None);
        assert!(bad.error.is_some());

        // 带参试运行：参数注入 args 数组（与变量求值一致）
        let with_args = engine.test_script("args[0].toUpperCase()", Some("abc"));
        assert_eq!(with_args.result, "ABC");
        assert!(with_args.error.is_none());

        // 无参试运行：空数组，args.length 可安全判断
        let no_args = engine.test_script("args.length >= 1 ? args[0] : \"none\"", None);
        assert_eq!(no_args.result, "none");
        let len_probe = engine.test_script("args.length.toString()", None);
        assert_eq!(len_probe.result, "0");

        // Array.join 原生支持（JS 标准 API）
        let mac = engine.test_script(
            "let parts = []; for (let i = 0; i < 3; i++) { parts.push(random_int(0, 255).toString(16)); } parts.join(\":\")",
            None,
        );
        assert!(mac.error.is_none(), "join 报错: {:?}", mac.error);
        assert_eq!(mac.result.split(':').count(), 3);
    }

    #[test]
    fn multi_stmt_script_and_repeat() {
        // 回归：多语句脚本（const + console.log + 模板字符串）与同引擎重复执行。
        // 两条保障：每次执行新建 Context 隔离作用域（const/let 不跨执行污染）；
        // flatten_newlines 压平换行规避 QuickJS 多行模板字符串编译错位 bug
        // （多行脚本中非首行模板字符串的插值表达式会编译错位，报 not a function /
        //  not initialized）。
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let engine = DynamicVarEngine::new().expect("引擎初始化");
        let script = "const tag = args.length >= 1 ? args[0] : \"ORD\"
console.log(`tag=${tag}`)
`${tag}-${timestamp()}-${random_string(6)}`";
        let r1 = engine.test_script(script, Some("B7"));
        assert!(r1.error.is_none(), "run1 报错: {:?}", r1.error);
        assert!(r1.result.contains("B7-"), "run1: {:?}", r1.result);
        assert_eq!(r1.output, "tag=B7");
        let r2 = engine.test_script(script, None);
        assert!(r2.error.is_none(), "run2 报错: {:?}", r2.error);
        assert!(r2.result.starts_with("ORD-"), "run2: {:?}", r2.result);
        // 重复执行不报 redeclaration
        for _ in 0..3 {
            let r = engine.test_script(script, None);
            assert!(r.error.is_none(), "重复执行报错: {:?}", r.error);
        }
    }

    #[test]
    fn multiline_template_variants() {
        // QuickJS 多行模板编译 bug 的其余变体（均依赖 flatten 修复后正常）
        let _g = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let engine = DynamicVarEngine::new().expect("引擎初始化");
        // 多行 + 纯变量插值
        let r1 = engine.test_script("const tag = \"B7\"\n`x=${tag}`", None);
        assert!(r1.error.is_none(), "r1: {:?}", r1.error);
        assert_eq!(r1.result, "x=B7");
        // 多行 + 模板引用全局函数
        let r2 = engine.test_script("const x = 1\n`y=${timestamp()}-${random_string(6)}`", None);
        assert!(r2.error.is_none(), "r2: {:?}", r2.error);
        assert!(r2.result.starts_with("y="));
        // 多行模板内容中的换行（字符串内容，非代码）
        let r3 = engine.test_script("const a = 1\n`x=${a}\n第二行`", None);
        assert!(r3.error.is_none(), "r3: {:?}", r3.error);
        assert_eq!(r3.result, "x=1\n第二行");
    }

    #[test]
    fn flatten_newlines_semantics() {
        // flatten_newlines：代码环境换行压为分号；字符串/模板内容/注释原样保留
        // 代码换行压为分号
        assert_eq!(
            flatten_newlines("const a = 1\nconst b = 2\na + b"),
            "const a = 1;const b = 2;a + b"
        );
        // 模板内容换行保留（字符串内容）
        assert_eq!(flatten_newlines("`a\nb`"), "`a\nb`");
        // 单引号字符串转义原样保留
        assert_eq!(
            flatten_newlines("const s = 'a\\'b'\n`x=${s}`"),
            "const s = 'a\\'b';`x=${s}`"
        );
        // 行注释丢弃到行尾
        assert_eq!(
            flatten_newlines("const a = 1 // 注释\n`x=${a}`"),
            "const a = 1 ;`x=${a}`"
        );
        // 块注释原样保留（含内部换行）
        assert_eq!(
            flatten_newlines("/* 多\n行 */\n`x=${1}`"),
            "/* 多\n行 */;`x=${1}`"
        );
        // 插值表达式内换行压平、括号嵌套计数
        assert_eq!(
            flatten_newlines("`x=${(() => {\n return 1\n })()}`"),
            "`x=${(() => {; return 1; })()}`"
        );
        // 插值内嵌套模板字符串（内容换行保留）
        assert_eq!(flatten_newlines("`a${`b\nc`}d`"), "`a${`b\nc`}d`");
        // 转义反引号不结束模板
        assert_eq!(flatten_newlines("`a\\`b`\n`c`"), "`a\\`b`;`c`");
        // 无换行脚本原样返回
        let s = "const a = 1; `x=${a}`";
        assert_eq!(flatten_newlines(s), s);
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
        let mut engine = engine_with_defs(&db);
        let defs = HashMap::new();
        *engine.defs.lock().unwrap() = defs;
        let r = engine.resolve_field("{{$timestamp}}");
        assert_eq!(r.resolved, "{{$timestamp}}");
    }

}
