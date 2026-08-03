import fs from 'node:fs'
import path from 'node:path'
import { type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const SRC_DIR = path.resolve(__dirname, 'src')
const MONACO_VS_SRC = path.resolve(__dirname, 'node_modules/monaco-editor/min/vs')
const MONACO_VS_DEST = path.resolve(__dirname, 'public/monaco-editor/vs')
const DIST_DIR = path.resolve(__dirname, 'dist')

/**
 * 运行时实际用到的 monaco 文件白名单（应用只使用 json/javascript/html/css/xml/typescript）。
 * monaco loader 按需拉取语言模块，全量拷贝 113 个文件（80 个 basic-languages + 全量
 * nls 翻译）纯属浪费：dist 体积与 release 资产数量都受影响。只拷贝白名单即可。
 * 注意：基础语法高亮走 vs/basic-languages/<id>/<id>（editor.main.js 的注册表），
 * 语言功能增强（诊断/补全 worker）走 vs/language/<id>/<id>Mode —— 两类都要保留。
 */
const MONACO_KEEP: string[] = [
  'loader.js',
  'base/browser/ui/codicons/codicon/codicon.ttf',
  'base/common/worker/simpleWorker.nls.js',
  'base/common/worker/simpleWorker.nls.zh-cn.js',
  'base/worker/workerMain.js',
  // 基础语法高亮（应用实际使用的语言）
  'basic-languages/css/css.js',
  'basic-languages/html/html.js',
  'basic-languages/javascript/javascript.js',
  'basic-languages/typescript/typescript.js',
  'basic-languages/xml/xml.js',
  'editor/editor.main.css',
  'editor/editor.main.js',
  'editor/editor.main.nls.js',
  'editor/editor.main.nls.zh-cn.js',
  // 语言功能增强（worker 诊断/补全）
  'language/css/cssMode.js',
  'language/css/cssWorker.js',
  'language/html/htmlMode.js',
  'language/html/htmlWorker.js',
  'language/json/jsonMode.js',
  'language/json/jsonWorker.js',
  'language/typescript/tsMode.js',
  'language/typescript/tsWorker.js',
]

/** 递归删除（unlinkSync/rmdirSync 实现；部分 Windows 环境 fs.rmSync recursive 失效） */
function rmTree(dir: string) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) rmTree(p)
    else fs.unlinkSync(p)
  }
  fs.rmdirSync(dir)
}

function monacoLocalPlugin(): Plugin {
  let isBuild = false
  return {
    name: 'monaco-local',
    configResolved(config) {
      isBuild = config.command === 'build'
    },
    buildStart() {
      if (!fs.existsSync(MONACO_VS_SRC)) return
      // 每次构建重建瘦身版（幂等；旧的全量拷贝残留也会被清掉）
      rmTree(MONACO_VS_DEST)
      for (const rel of MONACO_KEEP) {
        const src = path.join(MONACO_VS_SRC, rel)
        if (!fs.existsSync(src)) {
          throw new Error(`monaco 文件缺失: ${rel}`)
        }
        const dest = path.join(MONACO_VS_DEST, rel)
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.copyFileSync(src, dest)
      }
      // vite 内置 emptyDir 依赖 fs.rmSync（部分 Windows 环境失效），此处兜底清空 dist，
      // 避免历史 hash 资源残留进打包（release 资产与 MSI 体积都受影响）。
      // 仅 build 模式执行：dev 下删 dist 会导致 tauri dev 的 resources 校验失败
      if (isBuild) rmTree(DIST_DIR)
    },
  }
}

export default defineConfig({
  plugins: [react(), monacoLocalPlugin()],
  server: {
    host: true,
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/public/monaco-editor/**'],
    },
  },
  resolve: {
    alias: {
      '@': SRC_DIR,
    },
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        share: path.resolve(__dirname, 'share.html'),
      },
    },
  },
  base: './',
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
})
