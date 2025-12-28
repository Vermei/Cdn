require('dotenv').config()
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const fetch = require('node-fetch')
const cryptoJs = require('crypto-js')
const { fromBuffer } = require('file-type')
const path = require('path')
const cookieParser = require('cookie-parser')

const app = express()
app.use(express.json())
app.use(cookieParser())
app.use(cors({ 
    origin: ['https://njy.my.id'], 
    credentials: true,
    methods: ['GET', 'POST'], 
    allowedHeaders: ['Content-Type', 'User-Agent', 'Authorization'] 
}))

const uploadProcessor = multer({ 
    storage: multer.memoryStorage(), 
    limits: { fileSize: 25 * 1024 * 1024 } 
})

const defaultUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0.3 Mobile/15E148 Safari/604.1'
const githubToken = process.env.token
const githubUsername = process.env.username
const githubRepo = process.env.nameRepo
const telegramToken = process.env.tokenBot
const telegramChatId = process.env.chatId
const serverPort = process.env.port || 3000
const repoPath = `${githubUsername}/${githubRepo}`

const fileCache = new Map()
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']

function createHash(data) {
    return cryptoJs.SHA256(data).toString()
}

function generateName(ext) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let name = ''
    for (let i = 0, len = Math.floor(Math.random() * 2) + 4; i < len; i++) {
        name += chars[Math.floor(Math.random() * chars.length)]
    }
    return `${name}.${ext}`
}

async function sendTelegramLog(fileData, type, url, ipInfo, isDuplicate) {
    if (!telegramToken || !telegramChatId) return
    const maskedIp = createHash(ipInfo).substring(0, 12)
    const statusTag = isDuplicate ? '<b>[ RE-USE OLD FILE ]</b>' : '<b>[ NEW UPLOAD ]</b>'
    const message = `
🚀 <b>Media Activity Detected</b>
━━━━━━━━━━━━━━━━
Type: <code>${type}</code>
Status: ${statusTag}
File: <code>${fileData}</code>
IP Hash: <code>${maskedIp}</code>

🔗 <a href="${url}">Direct Link</a>
━━━━━━━━━━━━━━━━`
    
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            chat_id: telegramChatId, 
            text: message, 
            parse_mode: 'HTML',
            disable_web_page_preview: false 
        })
    }).catch(() => null)
}

async function githubRequest(url, opts = {}, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        const res = await fetch(url, { 
            headers: { Authorization: `token ${githubToken}`, 'User-Agent': defaultUserAgent, ...opts.headers }, 
            ...opts 
        })
        if (res.ok) return res
        if (res.status === 404 && i < retries) { 
            await new Promise(r => setTimeout(r, 1000))
            continue 
        }
        const errTxt = await res.text().catch(() => res.statusText)
        const error = new Error(errTxt)
        error.status = res.status
        throw error
    }
}

async function uploadToGithub(buffer) {
    const contentHash = createHash(cryptoJs.lib.WordArray.create(buffer))
    const typeInfo = await fromBuffer(buffer)
    if (!typeInfo || !allowedTypes.includes(typeInfo.mime)) throw new Error('Format tidak didukung')
    
    if (fileCache.has(contentHash)) {
        const existing = fileCache.get(contentHash)
        return { ...existing, isDuplicate: true, mimeType: typeInfo.mime }
    }
    
    const fileName = `/${generateName(typeInfo.ext)}`
    await githubRequest(`https://api.github.com/repos/${repoPath}/contents${fileName}`, { 
        method: 'PUT', 
        body: JSON.stringify({ 
            message: `upload ${fileName}`, 
            content: buffer.toString('base64'), 
            branch: 'main' 
        }) 
    })
    
    const result = { filename: path.basename(fileName), path: fileName }
    fileCache.set(contentHash, result)
    return { ...result, isDuplicate: false, mimeType: typeInfo.mime }
}

app.get('/user-info', (req, res) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress
    const userAgent = req.headers['user-agent']
    const sessionToken = createHash(clientIp + userAgent + githubToken).substring(0, 32)
    
    res.cookie('sessionAuth', sessionToken, { 
        httpOnly: true, 
        secure: true, 
        sameSite: 'none',
        domain: '.njy.my.id',
        maxAge: 3600000 
    })
    
    res.json({ 
        status: true,
        creator: "Muhammad Fikri",
        data: {
            ipHash: createHash(clientIp).substring(0, 16),
            userAgent: userAgent,
            sessionHash: sessionToken
        }
    })
})

app.post('/upload', uploadProcessor.single('file'), async (req, res) => {
    try {
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress
        const userAgent = req.headers['user-agent']
        const checkSession = createHash(clientIp + userAgent + githubToken).substring(0, 32)
        
        if (req.cookies.sessionAuth !== checkSession) return res.status(403).json({ status: false, message: 'Invalid session identification' })
        if (!req.file) return res.status(400).json({ status: false, message: 'No file detected' })
        
        const result = await uploadToGithub(req.file.buffer)
        const finalUrl = `https://${req.get('host')}/${result.path}`
        
        await sendTelegramLog(result.filename, 'Frontend Web', finalUrl, clientIp, result.isDuplicate)
        
        res.json({ 
            status: true, 
            creator: "Muhammad Fikri",
            result: {
                name: result.filename,
                url: finalUrl,
                mime: result.mimeType,
                isNew: !result.isDuplicate
            }
        })
    } catch (e) {
        res.status(500).json({ status: false, message: e.message })
    }
})

app.post('/api/upload', uploadProcessor.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ status: false, message: 'No file' })
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress
        const result = await uploadToGithub(req.file.buffer)
        const finalUrl = `https://${req.get('host')}/${result.path}`
        
        await sendTelegramLog(result.filename, 'Public API', finalUrl, clientIp, result.isDuplicate)
        
        res.json({ 
            status: true, 
            creator: "Muhammad Fikri",
            result: {
                name: result.filename,
                url: finalUrl,
                mime: result.mimeType,
                isNew: !result.isDuplicate
            }
        })
    } catch (e) {
        res.status(500).json({ status: false, message: e.message })
    }
})

app.get('/:filename', async (req, res) => {
    try {
        const proxyUrl = `https://cdn.jsdelivr.net/gh/${repoPath}@main/${req.params.filename}`
        const headers = {}
        if (req.headers.range) headers.Range = req.headers.range
        const response = await fetch(proxyUrl, { headers })
        const resHeaders = {}
        const headersToCopy = ['content-length', 'content-type', 'accept-ranges', 'content-range']
        headersToCopy.forEach(h => { if (response.headers.has(h)) resHeaders[h] = response.headers.get(h) })
        res.writeHead(response.status, resHeaders)
        response.body.pipe(res)
    } catch (e) {
        res.status(500).send(e.message)
    }
})

;(async () => {
    try {
        await githubRequest(`https://api.github.com/repos/${repoPath}`)
        app.listen(serverPort, () => console.log(`Server active on ${serverPort}`))
    } catch (e) {
        if (e.status === 404) {
            await githubRequest('https://api.github.com/user/repos', { 
                method: 'POST', 
                body: JSON.stringify({ name: githubRepo, private: false }) 
            })
            app.listen(serverPort)
        }
    }
})()
