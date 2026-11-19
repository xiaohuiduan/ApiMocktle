import { open } from '@tauri-apps/plugin-shell'

import { ALLOWED_PROTOCOL } from '@/utils/external-url'

/** 带协议的绝对链接，如 `https://`、`javascript:`、`mailto:` */
const HAS_SCHEME = /^[a-z][\w+.-]*:/i

let registered = false

/**
 * 决定一次链接点击该如何处理。
 *
 * - `open`：http/https（含 `//host` 协议相对写法），交给系统浏览器
 * - `block`：其它协议（`javascript:` / `data:` / `file:` / `mailto:` 等），
 *   拦下来但什么也不做 —— 它们同样会让 WebView 离开应用页面
 * - `ignore`：`#` 锚点与站内相对链接，保持原有行为
 *
 * 独立成纯函数，便于单测覆盖协议白名单。
 *
 * 注意：这里**不做**首尾标点剥离。Markdown 的 `href` 已经是精确 URL，
 * 剥离会把 `https://x/wiki/Foo_(bar)` 截断成坏地址；标点清理只服务
 * Monaco 场景（URL 取自 JSON 文本），走 `resolveExternalUrl`。
 */
export function decideAnchorAction(href: string | null | undefined): { action: 'open', url: string } | { action: 'block' } | { action: 'ignore' } {
  const raw = href?.trim()

  if (!raw || raw.startsWith('#')) {
    return { action: 'ignore' }
  }

  if (ALLOWED_PROTOCOL.test(raw)) {
    return { action: 'open', url: raw }
  }

  // 协议相对链接（`//example.com/a`）：站点无关，按 https 交给系统浏览器，
  // 否则 WebView 会拼成 `tauri://example.com/a` 自己导航走
  if (raw.startsWith('//')) {
    return { action: 'open', url: `https:${raw}` }
  }

  // 其余带协议的绝对链接（javascript: / data: / file: / mailto: / ftp: ...）一律拦截
  if (HAS_SCHEME.test(raw)) {
    return { action: 'block' }
  }

  // 站内相对链接（`/docs/x`、`docs/x`）
  return { action: 'ignore' }
}

/**
 * 把 http(s) 链接交给系统默认浏览器，失败时降级为新窗口。
 */
async function openExternal(url: string): Promise<void> {
  try {
    await open(url)
  }
  catch {
    // 非 Tauri 环境（浏览器调试）降级为新窗口，避免未捕获异常
    window.open(url, '_blank', 'noopener')
  }
}

/**
 * 文档预览里的 `<a>` 点击拦截：命中外链就交给系统浏览器，避免整个 WebView 导航走。
 *
 * bytemd Viewer 的 `onClick` 只处理 `#` 锚点，其余链接走浏览器默认行为；
 * 在 Tauri 下那会把 WebView2 导航到外站，且主窗口没有后退按钮，只能重启应用。
 */
function handleAnchorClick(event: MouseEvent): void {
  // 已处理过、非左键、或带修饰键（新窗口/下载等意图）时交给默认行为
  if (event.defaultPrevented || event.button !== 0) {
    return
  }

  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return
  }

  const target = event.target

  if (!(target instanceof Element)) {
    return
  }

  const anchor = target.closest('a[href]')

  if (!anchor) {
    return
  }

  // 带 download 的锚点是「程序化下载」（导出 Markdown、导出测试流程），
  // 走的是 blob: URL，拦下来会让下载直接失效
  if (anchor.hasAttribute('download')) {
    return
  }

  const decision = decideAnchorAction(anchor.getAttribute('href'))

  if (decision.action === 'ignore') {
    return
  }

  event.preventDefault()

  if (decision.action === 'open') {
    void openExternal(decision.url)
  }
}

/**
 * 注册 document 级 `<a>` 点击拦截，作用于全应用的外链，Markdown 预览是主要场景。
 *
 * 全局只需注册一次，重复调用直接返回。
 */
export function ensureAnchorExternalLinkHandler(): void {
  if (registered) {
    return
  }

  registered = true
  document.addEventListener('click', handleAnchorClick)
}

/** 仅供单测重置注册状态，业务代码不要调用 */
export function resetAnchorExternalLinkHandler(): void {
  document.removeEventListener('click', handleAnchorClick)
  registered = false
}
