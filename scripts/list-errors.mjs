// 列出指定规则（或全部 error）的位置：node scripts/list-errors.mjs <baseline.json> [ruleId...]
import { readFileSync } from 'node:fs'
import path from 'node:path'

const [, , jsonFile, ...rules] = process.argv
const data = JSON.parse(readFileSync(jsonFile, 'utf8'))
const seen = new Set()
for (const f of data) {
  for (const m of f.messages) {
    if (m.severity !== 2) continue
    if (rules.length > 0 && !rules.includes(m.ruleId)) continue
    const rel = path.relative(process.cwd(), f.filePath)
    const key = `${rel}:${m.line}:${m.column}`
    if (seen.has(key)) continue
    seen.add(key)
    console.log(`${rel}:${m.line}:${m.column} [${m.ruleId}] ${m.message.slice(0, 80)}`)
  }
}
