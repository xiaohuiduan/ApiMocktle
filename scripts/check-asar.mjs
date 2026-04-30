import { execSync } from 'child_process'
const lines = execSync('npx asar list release/win-unpacked/resources/app.asar').toString().split('\n')
const c = {}
for (const l of lines) {
  const parts = l.replace(/^\\/, '').split('\\')
  if (parts[0] === 'node_modules' && parts[1]) c[parts[1]] = (c[parts[1]] || 0) + 1
}
console.log('Top 20 packages by file count:')
Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => console.log(`  ${v}  ${k}`))
console.log(`\nTotal: ${lines.length} files`)
