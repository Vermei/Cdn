require('dotenv').config()
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const fetch = require('node-fetch')
const crypto = require('crypto-js')
const { fromBuffer } = require('file-type')
const path = require('path')

const app = express()
app.use(express.json())
app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'User-Agent'] }))

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0.3 Mobile/15E148 Safari/604.1'
const token = process.env.token
const username = process.env.username
const nameRepo = process.env.nameRepo || 'upldbase'
const port = process.env.port || 3000
const repo = `${username}/${nameRepo}`

if (!token || !username) {
  console.error('ENV token atau username kosong')
  process.exit(1)
}

const hashMap = new Map()
const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']

function sha256(buffer) {
  const wordArray = crypto.lib.WordArray.create(buffer)
  return crypto.SHA256(wordArray).toString()
}

function randName(ext) {
  const pool = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let name = ''
  for (let i = 0, len = Math.floor(Math.random() * 2) + 3; i < len; i++) name += pool[Math.floor(Math.random() * pool.length)]
  return `${name}.${ext}`
}

async function gh(url, opts = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, { headers: { Authorization: `token ${token}`, 'User-Agent': UA, ...opts.headers }, ...opts })
    if (res.ok) return res
    if (res.status === 404 && i < retries) { await new Promise(r => setTimeout(r, 1200)); continue }
    const txt = await res.text().catch(() => res.statusText)
    const err = new Error(txt || `GitHub ${res.status}`)
    err.status = res.status
    throw err
  }
}

async function validateToken() {
  const res = await gh('https://api.github.com/user')
  const scopes = res.headers.get('x-oauth-scopes') || ''
  if (!scopes.includes('repo')) throw new Error('repo scope missing')
}

async function ensureRepo() {
  try {
    await gh(`https://api.github.com/repos/${repo}`)
  } catch (e) {
    if (e.status === 404) {
      await gh('https://api.github.com/user/repos', { method: 'POST', body: JSON.stringify({ name: nameRepo, private: false, description: 'Public media storage' }) })
      await new Promise(r => setTimeout(r, 1500))
    } else throw e
  }
}

async function uploadMedia(buffer) {
  const hash = sha256(buffer)
  if (hashMap.has(hash)) return hashMap.get(hash)
  const info = await fromBuffer(buffer)
  if (!info || !allowedMime.includes(info.mime)) throw new Error('unsupported file type')
  const filename = `/${randName(info.ext)}`
  const url = `https://api.github.com/repos/${repo}/contents${filename}`
  await gh(url, { method: 'PUT', body: JSON.stringify({ message: `upload ${filename}`, content: buffer.toString('base64'), branch: 'main' }) })
  const result = { filename: path.basename(filename), path: filename }
  hashMap.set(hash, result)
  return result
}

app.use('/assets', express.static(path.join(__dirname, 'assets')))
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')))
app.get('/docs', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'docs.html')))
app.get('/info', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'info.html')))

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ status: false, message: 'Tidak ada file' })
    const result = await uploadMedia(req.file.buffer)
    const fullUrl = `${req.protocol}://${req.get('host')}/f${result.path}`
    res.json({ status: true, filename: result.filename, url: fullUrl })
  } catch (e) {
    let msg = e.message || 'Upload gagal'
    if (e.status === 401) msg = 'Token tidak valid'
    if (e.status === 403) msg = 'Token tidak memiliki izin menulis ke repo'
    res.status(e.status || 500).json({ status: false, message: msg })
  }
})

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ status: false, message: 'No file uploaded' })
    const result = await uploadMedia(req.file.buffer)
    const fullUrl = `${req.protocol}://${req.get('host')}/f${result.path}`
    res.json({ status: true, filename: result.filename, url: fullUrl })
  } catch (e) {
    let msg = e.message || 'Upload failed'
    if (e.status === 401) msg = 'Invalid token'
    if (e.status === 403) msg = 'Token has no write access to repo'
    res.status(e.status || 500).json({ status: false, message: msg })
  }
})

app.get('/f/:filename', async (req, res) => {
  try {
    const remote = `https://cdn.jsdelivr.net/gh/${repo}@main/${req.params.filename}`
    const headers = {}
    if (req.headers.range) headers.Range = req.headers.range
    const resp = await fetch(remote, { headers })
    if (!resp.ok) return res.sendStatus(resp.status)
    ['content-length', 'content-type', 'accept-ranges', 'content-range'].forEach(h => { if (resp.headers.has(h)) headers[h] = resp.headers.get(h) })
    res.writeHead(resp.status, headers)
    resp.body.pipe(res)
  } catch (e) {
    res.status(500).json({ error: e.message || 'Streaming failed' })
  }
})

;(async () => {
  try {
    await validateToken()
    await ensureRepo()
    app.listen(port, () => console.log(`Ready http://localhost:${port}`))
  } catch (e) {
    console.error('Init error:', e.message)
    process.exit(1)
  }
})()

module.exports = app
