#!/usr/bin/env node
// 在 Windows 上跑 `cargo test --lib`。
//
// cargo 的 rustc-link-arg-tests 不作用于 lib 的单元测试目标（只作用于 tests/ 下的
// 集成测试），所以 build.rs 里那套 manifest 注入对 `--lib` 无效：测试二进制没有内嵌
// manifest，Windows 加载器便绑到 comctl32 5.82，缺 tauri/tao 引用的
// TaskDialogIndirect 导出，进程在 main 之前就以 STATUS_ENTRYPOINT_NOT_FOUND
// (0xC0000139) 退出，一个用例都不会跑。
//
// 这里在链接完成后用 mt.exe 把 src-tauri/test.manifest 嵌进去，再运行测试。
// 用法：node scripts/test-rust.mjs [--features portable] [测试名过滤...]
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = join(ROOT, 'src-tauri', 'test.manifest')
const DEPS = join(ROOT, 'src-tauri', 'target', 'debug', 'deps')

const argv = process.argv.slice(2)
// --features 需要跟一个值，其余以 -- 开头的都是 cargo 参数，剩下的是 libtest 过滤名
const cargoArgs = []
const testArgs = []
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i]
  if (arg === '--features' || arg === '--test-threads') {
    cargoArgs.push(arg, argv[i + 1])
    i += 1
  }
  else if (arg.startsWith('--')) {
    cargoArgs.push(arg)
  }
  else {
    testArgs.push(arg)
  }
}

function findMt() {
  const kits = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin'
  if (!existsSync(kits)) return null
  const versions = readdirSync(kits).sort().reverse()
  for (const version of versions) {
    const candidate = join(kits, version, 'x64', 'mt.exe')
    if (existsSync(candidate)) return candidate
  }
  return null
}

function newestTestExe() {
  if (!existsSync(DEPS)) return null
  const hits = readdirSync(DEPS)
    .filter((name) => /^apimocktle_lib-.*\.exe$/.test(name))
    .map((name) => join(DEPS, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return hits[0] ?? null
}

if (process.platform !== 'win32') {
  // 非 Windows 没有 manifest 问题，直接跑
  execFileSync('cargo', ['test', '--manifest-path', join(ROOT, 'src-tauri', 'Cargo.toml'), '--lib', ...cargoArgs, ...testArgs], { cwd: ROOT, stdio: 'inherit' })
  process.exit(0)
}

const mt = findMt()
if (!mt) {
  console.error('找不到 mt.exe，请安装 Windows SDK（含 Windows Kits\\10\\bin\\<ver>\\x64\\mt.exe）')
  process.exit(1)
}
if (!existsSync(MANIFEST)) {
  console.error(`缺少 manifest：${MANIFEST}`)
  process.exit(1)
}

try {
  execFileSync('cargo', ['test', '--manifest-path', join(ROOT, 'src-tauri', 'Cargo.toml'), '--lib', ...cargoArgs, '--no-run'], { cwd: ROOT, stdio: ['inherit', 'inherit', 'inherit'] })
}
catch {
  console.error('编译失败，未运行测试')
  process.exit(1)
}

const exe = newestTestExe()
if (!exe) {
  console.error(`未在 ${DEPS} 找到 apimocktle_lib-*.exe`)
  process.exit(1)
}

execFileSync(mt, ['-nologo', '-manifest', MANIFEST, `-outputresource:${exe};#1`], { stdio: 'inherit' })

try {
  execFileSync(exe, testArgs, { stdio: 'inherit' })
}
catch (error) {
  process.exit(error.status ?? 1)
}
