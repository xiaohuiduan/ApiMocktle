import fs from 'node:fs'
import path from 'node:path'

import { reactRouter } from '@react-router/dev/vite'
import { defineConfig, type Plugin } from 'vite'

const SRC_DIR = path.resolve(__dirname, 'src')
const MONACO_VS_SRC = path.resolve(__dirname, 'node_modules/monaco-editor/min/vs')
const MONACO_VS_DEST = path.resolve(__dirname, 'public/monaco-editor/vs')

/** 将 monaco-editor/min/vs 复制到 public/monaco-editor/vs，确保本地加载 */
function monacoLocalPlugin(): Plugin {
  return {
    name: 'monaco-local',
    buildStart() {
      if (!fs.existsSync(MONACO_VS_SRC)) return
      if (fs.existsSync(MONACO_VS_DEST)) return
      fs.cpSync(MONACO_VS_SRC, MONACO_VS_DEST, { recursive: true })
    },
  }
}

/** 在客户端构建中排除 src/server/ 模块，避免 node:* 依赖被打入浏览器包 */
function serverExcludePlugin(): Plugin {
  let isSsrBuild = false
  return {
    name: 'server-exclude',
    enforce: 'pre',
    config(_config, { isSsrBuild: ssr }) {
      isSsrBuild = ssr ?? false
    },
    resolveId(id, _importer, options) {
      if (isSsrBuild || options.ssr) return
      const normalized = id.replace(/\\/g, '/')
      if (normalized.includes('/server/') || normalized.endsWith('/server')) {
        return { id: `\0server-excluded:${id}`, moduleSideEffects: false }
      }
    },
    // 读取真实模块以获取其导出名称，生成同名空导出存根
    async load(id) {
      if (!id.startsWith('\0server-excluded:')) return
      const realId = id.slice('\0server-excluded:'.length)
      // 尝试解析真实文件路径
      const resolved = await this.resolve(realId, undefined, { skipSelf: true })
      if (!resolved) return 'export default null;'
      let source: string
      try {
        source = fs.readFileSync(resolved.id.replace(/\?.*$/, ''), 'utf-8')
      } catch {
        return 'export default null;'
      }
      // 提取 export 声明的名称
      const names = new Set<string>()
      let hasDefault = false
      const re = /\bexport\s+(?:default|const|function|class|let|var|async\s+function)\s+(\w+)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(source))) {
        if (m[1] === 'default') hasDefault = true
        else names.add(m[1])
      }
      // export { a, b as c } 形式
      const reBrace = /\bexport\s*\{([^}]+)\}/g
      while ((m = reBrace.exec(source))) {
        for (const part of m[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/).pop()!.trim()
          if (name) names.add(name)
        }
      }
      const lines: string[] = []
      for (const n of names) lines.push(`export const ${n} = undefined;`)
      if (hasDefault) lines.push('export default null;')
      return lines.length > 0 ? lines.join('\n') : 'export default null;'
    },
  }
}

export default defineConfig({
  plugins: [serverExcludePlugin(), reactRouter(), monacoLocalPlugin()],
  // 允许局域网内其他设备通过本机 IP 访问（默认仅 localhost）
  server: {
    host: true,
    port: 49128,
    watch: {
      ignored: ['**/public/monaco-editor/**'],
    },
  },
  preview: {
    host: true,
  },
  resolve: {
    alias: {
      '@': SRC_DIR,
    },
  },
})
