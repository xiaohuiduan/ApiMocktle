// 分析 eslint --format json 基线：按规则/文件统计
import { readFileSync } from 'node:fs'
import path from 'node:path'

const data = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const byRule = new Map()
const byFile = new Map()
let total = 0
let errs = 0

for (const f of data) {
  for (const m of f.messages) {
    total++
    if (m.severity === 2) errs++
    byRule.set(m.ruleId, (byRule.get(m.ruleId) ?? 0) + 1)
    const rel = path.relative(process.cwd(), f.filePath)
    byFile.set(rel, (byFile.get(rel) ?? 0) + 1)
  }
}

console.log(`total: ${total}  errors: ${errs}  warnings: ${total - errs}`)
console.log('--- rules ---')
for (const [r, c] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(String(c).padStart(5), r)
}
if (process.argv[3] === 'files') {
  console.log('--- files ---')
  for (const [f, c] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(String(c).padStart(5), f)
  }
}
