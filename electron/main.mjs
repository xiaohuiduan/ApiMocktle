import { app, BrowserWindow, session } from 'electron'
import { fork } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' ws:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

/** 启动内嵌的 React Router SSR 服务，返回监听端口 */
function startServer() {
  return new Promise((resolve, reject) => {
    const serverEntry = path.join(__dirname, 'server.mjs')
    const child = fork(serverEntry, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    })

    child.stdout?.on('data', (data) => {
      const msg = data.toString()
      const match = msg.match(/http:\/\/localhost:(\d+)/)
      if (match) {
        resolve({ port: Number(match[1]), child })
      }
    })

    child.stderr?.on('data', (data) => {
      console.error('[server]', data.toString())
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Server exited with code ${code}`))
      }
    })

    setTimeout(() => reject(new Error('Server startup timeout')), 15000)
  })
}

function createWindow(port) {
  const preloadPath = path.join(__dirname, 'preload.cjs')
  // 打包后 icon 被 unpack 到 app.asar.unpacked 目录下
  const iconPath = isDev
    ? path.join(__dirname, '..', 'build', 'icons', 'icon.png')
    : path.join(__dirname, '..', '..', 'app.asar.unpacked', 'build', 'icons', 'icon.png')

  const winOpts = {
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'ApiMocktle',
    show: false,
    backgroundColor: '#FFFFFF',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: preloadPath,
    },
  }

  // macOS 由 electron-builder 在打包时设置图标，运行时无需指定
  if (process.platform !== 'darwin') {
    winOpts.icon = iconPath
  }

  const win = new BrowserWindow(winOpts)
  win.removeMenu()

  win.once('ready-to-show', () => {
    win.show()
  })

  // 阻止导航到外部 URL
  win.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url)
    if (parsed.origin !== `http://localhost:${port}`) {
      event.preventDefault()
    }
  })

  // 阻止打开新窗口
  win.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' }
  })

  const url = isDev
    ? 'http://localhost:49128'
    : `http://localhost:${port}`

  win.loadURL(url)

  if (isDev) {
    win.webContents.openDevTools()
  }

  return win
}

function setupCSP() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    })
  })
}

app.whenReady().then(async () => {
  setupCSP()

  let port = 49128

  if (!isDev) {
    console.log('[electron] Starting SSR server...')
    const server = await startServer()
    port = server.port
    console.log(`[electron] Server ready on port ${port}`)

    app.on('before-quit', () => {
      server.child.kill()
    })
  }

  createWindow(port)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(port)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
