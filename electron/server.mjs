import { createRequestHandler } from '@react-router/express'
import compression from 'compression'
import express from 'express'
import morgan from 'morgan'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BUILD_DIR = path.join(__dirname, '..', 'build')
const SERVER_BUILD = path.join(BUILD_DIR, 'server', 'index.js')
const CLIENT_DIR = path.join(BUILD_DIR, 'client')

const build = await import(pathToFileURL(SERVER_BUILD).href)

const app = express()
app.disable('x-powered-by')
app.use(compression())
app.use(
  build.publicPath + 'assets',
  express.static(path.join(CLIENT_DIR, 'assets'), { immutable: true, maxAge: '1y' }),
)
app.use(build.publicPath, express.static(CLIENT_DIR))
app.use(morgan('tiny'))
app.all('*', createRequestHandler({ build, mode: process.env.NODE_ENV || 'production' }))

const port = process.env.PORT || 0
const server = app.listen(port, () => {
  const addr = server.address()
  console.log(`http://localhost:${addr.port}`)
})
