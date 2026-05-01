import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const SRC_DIR = path.resolve(__dirname, 'src')
const MONACO_VS_SRC = path.resolve(__dirname, 'node_modules/monaco-editor/min/vs')
const MONACO_VS_DEST = path.resolve(__dirname, 'public/monaco-editor/vs')

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
  },
  base: './',
})
