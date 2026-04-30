import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(import.meta.dirname, '..')
const SVG_PATH = path.join(ROOT, 'public', 'favicon.svg')
const OUT_DIR = path.join(ROOT, 'build', 'icons')

fs.mkdirSync(OUT_DIR, { recursive: true })

const svgBuf = fs.readFileSync(SVG_PATH)

// 256×256 PNG — used by BrowserWindow and electron-builder (all platforms)
await sharp(svgBuf)
  .resize(256, 256)
  .png()
  .toFile(path.join(OUT_DIR, 'icon.png'))

console.log('✓ build/icons/icon.png (256×256)')
