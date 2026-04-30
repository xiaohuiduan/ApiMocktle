import { spawn } from 'node:child_process'
import http from 'node:http'

const vite = spawn('pnpm', ['dev'], { stdio: 'inherit', shell: true })
let electronStarted = false

function tryStartElectron() {
  if (electronStarted) return
  electronStarted = true

  const electron = spawn('electron', ['.'], { stdio: 'inherit', shell: true })
  electron.on('close', () => {
    vite.kill()
    process.exit(0)
  })
}

function poll() {
  if (electronStarted) return
  const req = http.get('http://localhost:5174', () => {
    tryStartElectron()
  })
  req.on('error', () => {})
  req.setTimeout(500, () => { req.destroy() })
}

const timer = setInterval(poll, 1000)
poll()

vite.on('close', () => {
  clearInterval(timer)
  process.exit(0)
})

process.on('SIGINT', () => {
  vite.kill()
  process.exit(0)
})
