use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

use crate::db::client::Db;
use crate::http::share_server::ShareServerHandle;
use crate::models::*;

#[derive(Debug, Serialize, Deserialize)]
pub struct ShareServerStatus {
    pub running: bool,
    pub port: u16,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ShareServerConfig {
    pub port: u16,
}

/// 解析前端静态目录。打包后优先取资源目录 dist/（Tauri resources 保留目录名）；
/// 兜底兼容资源目录展开布局（share.html 直接在资源根）；dev 下取项目根 ../dist。
/// 以 share.html 实际存在为准（避免解析到空目录导致「分享页面不可用」误报）。
fn resolve_dist_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(p) = app.path().resolve("dist", tauri::path::BaseDirectory::Resource) {
        if p.join("share.html").is_file() {
            return Some(p);
        }
    }
    if let Ok(root) = app.path().resource_dir() {
        if root.join("share.html").is_file() {
            return Some(root);
        }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist");
    if dev.join("share.html").is_file() {
        Some(dev)
    } else {
        None
    }
}

#[tauri::command]
pub async fn get_share_server_status(
    handle: State<'_, Arc<ShareServerHandle>>,
) -> Result<ApiResult<ShareServerStatus>, String> {
    let running = handle.is_running().await;
    let port = handle.get_port().await;

    Ok(ApiResult::success(ShareServerStatus { running, port }))
}

#[tauri::command]
pub async fn start_share_server(
    app: tauri::AppHandle,
    db: State<'_, Arc<Db>>,
    handle: State<'_, Arc<ShareServerHandle>>,
    port: Option<u16>,
) -> Result<ApiResult<ShareServerStatus>, String> {
    // Check if already running
    if handle.is_running().await {
        let current_port = handle.get_port().await;
        return Ok(ApiResult::success(ShareServerStatus {
            running: true,
            port: current_port,
        }));
    }

    let preferred_port = port.unwrap_or(14204);
    let db_clone = db.inner().clone();
    let handle_clone = handle.inner().clone();
    let dist_dir = resolve_dist_dir(&app);

    tokio::spawn(async move {
        crate::http::share_server::start_share_server(
            db_clone,
            handle_clone,
            preferred_port,
            dist_dir,
        )
        .await;
    });

    // Wait a bit for the server to start
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    let running = handle.is_running().await;
    let actual_port = handle.get_port().await;

    Ok(ApiResult::success(ShareServerStatus {
        running,
        port: actual_port,
    }))
}

#[tauri::command]
pub async fn stop_share_server(
    handle: State<'_, Arc<ShareServerHandle>>,
) -> Result<ApiResult<ShareServerStatus>, String> {
    handle.stop().await;

    Ok(ApiResult::success(ShareServerStatus {
        running: false,
        port: 0,
    }))
}

#[tauri::command]
pub async fn get_share_server_config(
    app_config: State<'_, Arc<crate::services::app_config::AppConfigService>>,
) -> Result<ApiResult<ShareServerConfig>, String> {
    let port = app_config
        .get("share_port")
        .and_then(|v| v.as_u64())
        .unwrap_or(14204) as u16;

    Ok(ApiResult::success(ShareServerConfig { port }))
}

#[tauri::command]
pub async fn save_share_server_config(
    app_config: State<'_, Arc<crate::services::app_config::AppConfigService>>,
    config: ShareServerConfig,
) -> Result<ApiResult<()>, String> {
    app_config.set("share_port", serde_json::json!(config.port));

    Ok(ApiResult::success(()))
}

/// 常见的虚拟网卡关键字（VMware/VirtualBox/Hyper-V/Docker/WSL 等）
const VIRTUAL_IFACE_KEYWORDS: [&str; 9] = [
    "vmware", "virtualbox", "hyper-v", "hyperv", "vethernet", "wsl", "docker", "vmnet",
    "tailscale",
];

/// IPv4 是否属于私网段（10/8、172.16/12、192.168/16）
fn is_private_v4(ip: &std::net::Ipv4Addr) -> bool {
    let o = ip.octets();
    o[0] == 10
        || (o[0] == 172 && (16..=31).contains(&o[1]))
        || (o[0] == 192 && o[1] == 168)
}

/// 过滤对局域网分享无用的地址：
/// - 虚拟网卡（按网卡名关键字）
/// - 链路本地（169.254/16、fe80::/10，无 DHCP 自动地址，局域网不可达）
/// - Benchmark 测试网段（198.18/15，代理虚拟网卡常用）
/// - Docker 默认网桥（172.17/16）
/// - 非私网 IPv4（公网地址不是本机局域网入口）
fn is_useful_lan_ip(name: &str, ip: &std::net::IpAddr) -> bool {
    if ip.is_loopback() {
        return false;
    }
    let lower = name.to_lowercase();
    if VIRTUAL_IFACE_KEYWORDS.iter().any(|k| lower.contains(k)) {
        return false;
    }
    match ip {
        std::net::IpAddr::V4(v4) => {
            let o = v4.octets();
            if o[0] == 169 && o[1] == 254 {
                return false;
            }
            if o[0] == 198 && (o[1] == 18 || o[1] == 19) {
                return false;
            }
            if o[0] == 172 && o[1] == 17 {
                return false;
            }
            is_private_v4(v4)
        }
        std::net::IpAddr::V6(v6) => v6.segments()[0] != 0xfe80,
    }
}

/// 排序：IPv4 私网优先（更可能是真实局域网入口）
fn lan_ip_sort_key(ip: &str) -> (u8, String) {
    if ip.parse::<std::net::Ipv4Addr>().is_ok() {
        (0, ip.to_string())
    }
    else {
        (1, ip.to_string())
    }
}

/// 本机局域网 IP 列表（用于展示访问地址，已过滤虚拟网卡与不可达地址）
#[tauri::command]
pub async fn get_lan_ip() -> Result<ApiResult<Vec<String>>, String> {
    let mut ips: Vec<String> = match local_ip_address::list_afinet_netifas() {
        Ok(ifas) => ifas
            .into_iter()
            .filter(|(name, ip)| is_useful_lan_ip(name, ip))
            .map(|(_, ip)| ip.to_string())
            .collect(),
        Err(_) => Vec::new(),
    };
    ips.sort_by_key(|ip| lan_ip_sort_key(ip));

    Ok(ApiResult::success(ips))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filter_lan_ips() {
        use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

        let cases = [
            // (网卡名, IP, 期望结果)
            ("以太网", IpAddr::V4(Ipv4Addr::new(192, 168, 1, 5)), true),
            ("WLAN", IpAddr::V4(Ipv4Addr::new(10, 142, 124, 97)), true),
            ("Ethernet", IpAddr::V4(Ipv4Addr::new(172, 20, 10, 1)), true),
            // APIPA 链路本地
            ("以太网", IpAddr::V4(Ipv4Addr::new(169, 254, 219, 241)), false),
            // Benchmark 网段（代理虚拟网卡）
            ("Loopback Pseudo-Interface", IpAddr::V4(Ipv4Addr::new(198, 18, 0, 1)), false),
            // Docker 网桥
            ("vEthernet (Docker)", IpAddr::V4(Ipv4Addr::new(172, 17, 144, 1)), false),
            // Hyper-V 虚拟交换机
            ("vEthernet (Default Switch)", IpAddr::V4(Ipv4Addr::new(192, 168, 221, 1)), false),
            // VMware
            ("VMware Network Adapter VMnet1", IpAddr::V4(Ipv4Addr::new(192, 168, 233, 1)), false),
            // IPv6 链路本地
            ("以太网", IpAddr::V6(Ipv6Addr::new(0xfe80, 0, 0, 0, 0, 0, 0, 1)), false),
            // IPv6 ULA
            ("以太网", IpAddr::V6(Ipv6Addr::new(0xfd00, 0, 0, 0, 0, 0, 0, 1)), true),
            // loopback
            ("Loopback Pseudo-Interface", IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)), false),
        ];

        for (name, ip, expected) in cases {
            let got = is_useful_lan_ip(name, &ip);
            assert_eq!(got, expected, "网卡 {} 的 {} 过滤结果应为 {expected}", name, ip);
        }
    }
}
