// 打印指定规则的样例：node scripts/lint-samples.mjs <baseline.json> <ruleId> [limit]
import { readFileSync } from 'node:fs'
import path from 'node:path'

const [, , jsonFile, ruleId, limitArg] = process.argv
const data = JSON.parse(readFileSync(jsonFile, 'utf8'))
const limit = Number(limitArg ?? 20)
const samples = []
for (const f of data) {
  for (const m of f.messages) {
    if (ruleId === 'all' || m.ruleId === ruleId) {
      samples.push({ f: path.relative(process.cwd(), f.filePath), line: m.line, msg: m.message.slice(0, 90) })
    }
  }
}
console.log(`${ruleId}: ${samples.length} total`)
for (const s of samples.slice(0, limit)) {
  console.log(`${s.f}:${s.line} - ${s.msg}`)
}
