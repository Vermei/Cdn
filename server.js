require('dotenv').config()
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const cookieParser = require('cookie-parser')
const path = require('path')
const {
    generateSessionToken,
    validateSession,
    validateFileBuffer,
    getClientIp
} = require('./lib/validateController')
const {
    checkRepoExists,
    createRepo,
    uploadFile,
    getFileFromCDN,
    sendTelegramNotification
} = require('./lib/githubController')
const {
    generalMiddleware,
    uploadMiddleware,
    apiMiddleware
} = require('./lib/securityController')

const app = express()
app.set('trust proxy', true)
app.use(express.json())
app.use(cookieParser())
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}))
app.use(generalMiddleware)

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }
})

const port = process.env.PORT || 3000

app.get('/api/user-info', (req, res) => {
    const clientIp = getClientIp(req)
    const userAgent = req.headers['user-agent'] || 'Unknown'
    const githubToken = process.env.token

    const sessionToken = generateSessionToken(clientIp, userAgent, githubToken)

    res.cookie('sessionAuth', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 3600000,
        path: '/'
    })

    res.json({
        status: true,
        data: {
            sessionToken: sessionToken.substring(0, 16)
        }
    })
})

app.post('/upload', uploadMiddleware, upload.single('file'), async (req, res) => {
    try {
        const clientIp = getClientIp(req)
        const userAgent = req.headers['user-agent'] || 'Unknown'
        const githubToken = process.env.token
        const sessionCookie = req.cookies.sessionAuth

        if (!validateSession(clientIp, userAgent, githubToken, sessionCookie)) {
            return res.status(403).json({
                status: false,
                message: 'Invalid session. Refresh page and try again.'
            })
        }

        if (!req.file) {
            return res.status(400).json({
                status: false,
                message: 'No file uploaded'
            })
        }

        const validation = await validateFileBuffer(req.file.buffer)
        if (!validation.valid) {
            return res.status(400).json({
                status: false,
                message: validation.message
            })
        }

        const uploadResult = await uploadFile(req.file.buffer)
        const fileUrl = 'https://' + req.get('host') + '/files/' + uploadResult.path

        await sendTelegramNotification(
            uploadResult.filename,
            'Web',
            fileUrl,
            clientIp,
            uploadResult.isDuplicate
        )

        res.json({
            status: true,
            result: {
                name: uploadResult.filename,
                url: fileUrl,
                mime: uploadResult.mimeType,
                isNew: !uploadResult.isDuplicate
            }
        })
    } catch (error) {
        console.error('Upload error:', error)
        res.status(500).json({
            status: false,
            message: 'Upload failed. Please try again.'
        })
    }
})

app.post('/api/upload', apiMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                status: false,
                message: 'No file uploaded'
            })
        }

        const validation = await validateFileBuffer(req.file.buffer)
        if (!validation.valid) {
            return res.status(400).json({
                status: false,
                message: validation.message
            })
        }

        const clientIp = getClientIp(req)
        const uploadResult = await uploadFile(req.file.buffer)
        const fileUrl = 'https://' + req.get('host') + '/files/' + uploadResult.path

        await sendTelegramNotification(
            uploadResult.filename,
            'API',
            fileUrl,
            clientIp,
            uploadResult.isDuplicate
        )

        res.json({
            status: true,
            result: {
                name: uploadResult.filename,
                url: fileUrl,
                mime: uploadResult.mimeType,
                isNew: !uploadResult.isDuplicate
            }
        })
    } catch (error) {
        console.error('API upload error:', error)
        res.status(500).json({
            status: false,
            message: 'Upload failed. Please try again.'
        })
    }
})

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.get('/docs', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'docs.html'))
})

app.use(express.static('public'))
app.use('/assets', express.static('assets'))

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        platform: process.env.VERCEL ? 'Vercel' : 'Node.js'
    })
})

app.get('/api', (req, res) => {
    res.json({
        name: 'Fik Uploader API',
        version: '2.3',
        endpoints: {
            'POST /api/upload': 'Upload file (public)',
            'GET /files/:filename': 'Get file (CDN)',
            'GET /health': 'Health check'
        }
    })
})

app.get('/files/:filename', async (req, res) => {
    try {
        const filename = path.basename(req.params.filename)

        if (!/^[a-zA-Z0-9\-_]+\.[a-zA-Z0-9]{2,6}$/.test(filename)) {
            return res.status(400).json({
                status: false,
                message: 'Invalid filename format'
            })
        }

        const { response, responseHeaders } = await getFileFromCDN(filename, req.headers)

        if (!response.ok) {
            return res.status(404).json({
                status: false,
                message: 'File not found'
            })
        }

        res.writeHead(response.status, responseHeaders)
        response.body.pipe(res)
    } catch (error) {
        console.error('File retrieval error:', error)
        res.status(404).json({
            status: false,
            message: 'File not found'
        })
    }
})

;(async () => {
    const username = process.env.username
    const repoName = process.env.nameRepo

    try {
        const exists = await checkRepoExists(username, repoName)
        if (!exists) {
            await createRepo(repoName)
        }
    } catch (error) {
        if (error.status === 404) {
            await createRepo(repoName)
        }
    }

    const server = app.listen(port, () => {
        console.log('Server running on port ' + port)
    })

    server.timeout = 30000
    server.headersTimeout = 31000
})()
