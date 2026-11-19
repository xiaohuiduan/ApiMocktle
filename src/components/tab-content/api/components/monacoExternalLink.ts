import type { Monaco } from '@monaco-editor/react'
import { open } from '@tauri-apps/plugin-shell'

import { resolveExternalUrl } from '@/utils/external-url'

export { resolveExternalUrl }

let registered = false

/**
 * 注册 Monaco 全局链接打开器：Ctrl/Cmd + 点击 http(s) 链接时交给系统默认浏览器。
 *
 * Monaco 的 `links` 选项默认开启，命中链接后由这里接管，替代 WebView 内的默认
 * window.open 行为（Tauri 下会被拦截或弹出空白窗口）。
 *
 * 全局只需注册一次，重复调用直接返回。
 */
export function ensureExternalLinkOpener(monaco: Monaco): void {
  if (registered) {
    return
  }

  registered = true

  monaco.editor.registerLinkOpener({
    async open(resource) {
      const url = resolveExternalUrl(resource.toString(true))

      if (!url) {
        return false
      }

      try {
        await open(url)
      }
      catch {
        // 非 Tauri 环境（浏览器调试）降级为新窗口，避免未捕获异常
        window.open(url, '_blank', 'noopener')
      }

      return true
    },
  })
}
