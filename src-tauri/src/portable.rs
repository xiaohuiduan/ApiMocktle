//! 便携版数据目录。
//!
//! 编译期由 `portable` feature 决定：带 feature 时数据只落 `<exe 同级>/data`，
//! 不带时返回 `None` 由调用方走 `app_data_dir()`。运行期不做任何目录嗅探。

/// 便携版基础数据目录：`<exe 同级>/data`，目录不存在则创建。
///
/// 返回 `None` 表示路径解析或目录创建失败。调用方对便携版**必须**直接报错，
/// 不得回退到 `app_data_dir()` —— 否则会读到安装版的数据，造成串台。
#[cfg(feature = "portable")]
pub fn base_data_dir() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?.join("data");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

/// 非便携版不参与目录决策，恒为 `None`。
/// 调用点已按 feature 排除，故无 feature 时此函数无人调用。
#[cfg(not(feature = "portable"))]
#[cfg_attr(not(test), allow(dead_code))]
pub fn base_data_dir() -> Option<std::path::PathBuf> {
    None
}

/// 便携版把 WebView2 的用户数据（localStorage / IndexedDB）也纳入 `<exe>/data`，
/// 否则拷贝目录带走时登录态、草稿、主题会留在 `%LOCALAPPDATA%`。
///
/// 必须在 WebView 环境创建前调用。`WindowConfig::data_directory` 只收相对路径且
/// 基准是 `%LOCALAPPDATA%`，指不到 exe 同级，故只能走这个环境变量。
#[cfg(feature = "portable")]
pub fn apply_webview2_user_data_folder() {
    if let Some(dir) = base_data_dir() {
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", dir.join("webview2"));
    }
}

#[cfg(not(feature = "portable"))]
pub fn apply_webview2_user_data_folder() {}

#[cfg(test)]
mod tests {
    use super::base_data_dir;

    #[cfg(feature = "portable")]
    #[test]
    fn portable_dir_ends_with_data() {
        let dir = base_data_dir().expect("便携版应能解析出 data 目录");
        assert_eq!(dir.file_name().unwrap(), "data");
        assert!(dir.is_dir(), "base_data_dir 应创建目录");
    }

    #[cfg(not(feature = "portable"))]
    #[test]
    fn non_portable_returns_none() {
        assert!(base_data_dir().is_none());
    }
}
