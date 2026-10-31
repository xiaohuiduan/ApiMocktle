#!/usr/bin/env node
// 构建 Windows 便携版：前端产物 + 带 portable feature 的 Windows exe + 组装成单目录。
// 便携版运行时数据只读写 <exe 同级>/data，不回退 %APPDATA%。
import { execSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TRIPLE = 'x86_64-pc-windows-msvc'
const RELEASE = join(ROOT, 'src-tauri', 'target', TRIPLE, 'release')
const OUT = join(ROOT, 'dist-portable', 'ApiMocktle')

const run = (cmd, cwd) => {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

const fail = (msg) => {
  console.error(`\n构建失败：${msg}`)
  process.exit(1)
}

// 1+2. 前端构建 + Windows MSVC 交叉编译
// 前端由 tauri.conf.json 的 beforeBuildCommand 自动执行，无需单独调用。
// 必须走 tauri CLI 而不是裸 cargo：release 构建需要 tauri/custom-protocol feature，
// 缺它 tauri 会判定为 dev 模式，WebView 加载 devUrl（http://localhost:1420）导致连接被拒。
// --no-bundle 跳过 NSIS 安装包，只产 exe；--runner cargo-xwin 提供 MSVC SDK。
//
// 不要加 src-tauri/.cargo/config.toml 的 [target] rustflags：它会顶掉 cargo-xwin 注入的
// SDK 链接参数，链接期报 free/malloc/realloc undefined symbol。
// cargo-xwin 自身已静态链接 VC 运行库，产物不依赖 vcruntime140/msvcp140；
// UCRT（api-ms-win-crt-*）走系统自带，Windows 10+ 均可用。
run(`pnpm exec tauri build --target ${TRIPLE} --no-bundle --runner cargo-xwin --features portable`, ROOT)

// 3. 清空并重建输出目录
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

// 4. exe：Tauri 不 bundle 时不会套用 productName，需手动改名。
// 用复制而非移动，保留 target 里的产物，重复构建不必重新链接。
const srcExe = join(RELEASE, 'apimocktle.exe')
if (!existsSync(srcExe)) fail(`找不到 ${srcExe}`)
copyFileSync(srcExe, join(OUT, 'ApiMocktle.exe'))

// 5. 前端静态资源（share_server 从 Resource 目录找 dist/share.html）
const srcDist = join(RELEASE, 'dist')
if (!existsSync(srcDist)) fail(`找不到 ${srcDist}`)
cpSync(srcDist, join(OUT, 'dist'), { recursive: true })

// 6. data 目录（便携版运行时会自建，这里预建让用户一眼看到数据位置）
mkdirSync(join(OUT, 'data'), { recursive: true })

// 7. 产物断言
const required = ['ApiMocktle.exe', 'dist/share.html', 'data']
for (const rel of required) {
  if (!existsSync(join(OUT, rel))) fail(`产物缺少 ${rel}`)
}

console.log(`\n便携版已生成：${OUT}`)
console.log('拷贝整个 ApiMocktle 目录即可在 Windows 上直接运行，数据写入同目录 data/。')
