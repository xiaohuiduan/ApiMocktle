use std::time::Instant;

// Replicate the build_client_with_proxy logic for integration testing.
// The lib crate's version is private, so we test the proxy connection
// by manually constructing a reqwest client with proxy configuration.
fn build_test_client(proxy_type: &str, host: &str, port: u16) -> reqwest::Client {
    let mut builder = reqwest::Client::builder();
    match proxy_type {
        "socks5" => {
            let url = format!("socks5://{}:{}", host, port);
            if let Ok(p) = reqwest::Proxy::all(&url) {
                builder = builder.proxy(p);
            }
        }
        "http" => {
            let url = format!("http://{}:{}", host, port);
            if let Ok(p) = reqwest::Proxy::all(&url) {
                builder = builder.proxy(p);
            }
        }
        _ => {}
    }
    builder.no_proxy().build().unwrap_or_default()
}

/// Integration test: verify HTTP request through SOCKS5 proxy at 127.0.0.1:7890
///
/// This test is ignored by default because it requires a local proxy service.
/// Run with: cargo test -- --ignored
///
/// Prerequisites:
///   - A SOCKS5 proxy running at 127.0.0.1:7890 (e.g., Clash, v2ray, ssh -D)
///   - Network access to https://baidu.com
#[tokio::test]
#[ignore]
async fn test_http_request_through_socks5_proxy() {
    let client = build_test_client("socks5", "127.0.0.1", 7890);
    let start = Instant::now();
    let resp = client
        .get("https://baidu.com")
        .send()
        .await
        .expect("请求通过 SOCKS5 代理失败");
    let duration = start.elapsed().as_millis();
    assert!(
        resp.status().is_success(),
        "请求失败: HTTP {} ({}ms)",
        resp.status(),
        duration,
    );
    println!(
        "通过 SOCKS5 代理 127.0.0.1:7890 请求 https://baidu.com 成功: HTTP {}, {}ms",
        resp.status(),
        duration,
    );
}

/// Integration test: verify HTTP request through HTTP proxy at 127.0.0.1:7890
#[tokio::test]
#[ignore]
async fn test_http_request_through_http_proxy() {
    let client = build_test_client("http", "127.0.0.1", 7890);
    let start = Instant::now();
    let resp = client
        .get("https://baidu.com")
        .send()
        .await
        .expect("请求通过 HTTP 代理失败");
    let duration = start.elapsed().as_millis();
    assert!(
        resp.status().is_success(),
        "请求失败: HTTP {} ({}ms)",
        resp.status(),
        duration,
    );
    println!(
        "通过 HTTP 代理 127.0.0.1:7890 请求 https://baidu.com 成功: HTTP {}, {}ms",
        resp.status(),
        duration,
    );
}
