fn main() {
    tauri_build::build();

    // Windows MSVC 下 cargo test 的测试二进制没有内嵌 manifest,加载时绑定旧版
    // comctl32 5.82,缺少 tauri/tao 引用的 TaskDialogIndirect 导出,进程启动即
    // STATUS_ENTRYPOINT_NOT_FOUND。为测试目标内嵌声明 Common-Controls 6.0 的 manifest。
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("test.manifest");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}", manifest.display());
    }
}
