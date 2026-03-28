const fetch = require('node-fetch')
const { fromBuffer } = require('file-type')
const crypto = require('crypto')
const { createSecureHash, validateFileType, maskIp } = require('./validateController')

const defaultUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0.3 Mobile/15E148 Safari/604.1'
const fileCache = new Map()
const uploadLocks = new Map()
const maxCacheSize = 1000

async function githubRequest(endpoint, options = {}) {
    const url = 'https://api.github.com' + endpoint
    const response = await fetch(url, {
        headers: {
            'Authorization': 'token ' + process.env.token,
            'User-Agent': defaultUserAgent,
            ...options.headers
        },
        method: options.method || 'GET',
        body: options.body
    })

    if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText)
        const error = new Error(errorText)
        error.status = response.status
        throw error
    }

    return response
}

async function checkRepoExists(username, repoName) {
    try {
        await githubRequest('/repos/' + username + '/' + repoName)
        return true
    } catch (error) {
        return false
    }
}

async function createRepo(repoName) {
    return await githubRequest('/user/repos', {
        method: 'POST',
        body: JSON.stringify({
            name: repoName,
            private: false,
            auto_init: true
        })
    })
}

function generateFileName(ext) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let name = ''
    const length = Math.floor(Math.random() * 2) + 3
    for (let i = 0; i < length; i++) {
        name += chars[Math.floor(Math.random() * chars.length)]
    }
    return name + '.' + ext
}

async function uploadFile(buffer) {
    const contentHash = createSecureHash(buffer)
    
    while (uploadLocks.has(contentHash)) {
        await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    if (fileCache.has(contentHash)) {
        const cached = fileCache.get(contentHash)
        const typeInfo = await fromBuffer(buffer)
        return {
            ...cached,
            isDuplicate: true,
            mimeType: typeInfo ? typeInfo.mime : 'unknown'
        }
    }

    try {
        uploadLocks.set(contentHash, true)
        
        if (fileCache.has(contentHash)) {
            const cached = fileCache.get(contentHash)
            const typeInfo = await fromBuffer(buffer)
            return {
                ...cached,
                isDuplicate: true,
                mimeType: typeInfo ? typeInfo.mime : 'unknown'
            }
        }

        const typeInfo = await fromBuffer(buffer)
        if (!typeInfo) {
            throw new Error('Cannot detect file type')
        }

        if (!validateFileType(typeInfo.mime)) {
            throw new Error('File type ' + typeInfo.mime + ' is not supported')
        }

        const fileName = generateFileName(typeInfo.ext)
        const repoPath = process.env.username + '/' + process.env.nameRepo

        await githubRequest('/repos/' + repoPath + '/contents/' + fileName, {
            method: 'PUT',
            body: JSON.stringify({
                message: 'upload ' + fileName,
                content: buffer.toString('base64'),
                branch: 'main'
            })
        })

        const result = {
            filename: fileName,
            path: fileName,
            mimeType: typeInfo.mime
        }

        if (fileCache.size >= maxCacheSize) {
            const firstKey = fileCache.keys().next().value
            fileCache.delete(firstKey)
        }
        fileCache.set(contentHash, result)
        
        return { ...result, isDuplicate: false }
    } finally {
        uploadLocks.delete(contentHash)
    }
}

async function getFileFromCDN(filename, reqHeaders) {
    const repoPath = process.env.username + '/' + process.env.nameRepo
    const cdnUrl = 'https://cdn.jsdelivr.net/gh/' + repoPath + '@main/' + filename

    const headers = {}
    if (reqHeaders.range) {
        headers.Range = reqHeaders.range
    }

    const response = await fetch(cdnUrl, { headers })

    const responseHeaders = {}
    const headersToCopy = ['content-length', 'content-type', 'accept-ranges', 'content-range']
    headersToCopy.forEach(header => {
        if (response.headers.has(header)) {
            responseHeaders[header] = response.headers.get(header)
        }
    })

    return { response, responseHeaders }
}

async function sendTelegramNotification(filename, type, url, clientIp, isDuplicate) {
    const telegramToken = process.env.tokenBot
    const chatId = process.env.chatId

    if (!telegramToken || !chatId) return

    const maskedIp = maskIp(clientIp)
    const statusTag = isDuplicate ? 'RE-USE OLD FILE' : 'NEW UPLOAD'
    const fileType = url.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? '🖼️ Image' : url.match(/\.(mp4|webm|mov)$/i) ? '🎬 Video' : '📄 File'
    const source = type === 'Web' ? '🌐 Frontend' : '⚡ API'
    
    const now = new Date()
    const timestamp = now.toLocaleString('id-ID', { 
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).replace(/\./g, ':')

    const message = '🚀 *UPLOAD NOTIFICATION*\n' +
        '━━━━━━━━━━━━━━━━━━━━━━\n\n' +
        '📁 *File:* `' + escapeMarkdown(filename) + '`\n' +
        '📊 *Type:* ' + fileType + '\n' +
        '📍 *Source:* ' + source + '\n' +
        '🏷️ *Status:* #' + (isDuplicate ? 'DUPLICATE' : 'NEW') + '\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━\n\n' +
        '🔗 *Download URL:*\n' +
        '`' + escapeMarkdown(url) + '`\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━\n\n' +
        '🔐 *IP:* `' + escapeMarkdown(maskedIp) + '`\n' +
        '⏰ *Time:* `' + timestamp + '`\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━'

    try {
        await fetch('https://api.telegram.org/bot' + telegramToken + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            })
        })
    } catch (e) {
        console.log('Telegram notification failed:', e.message)
    }
}

function escapeMarkdown(text) {
    return text.replace(/[_*\[\]()]/g, '\\$&')
}

module.exports = {
    githubRequest,
    checkRepoExists,
    createRepo,
    uploadFile,
    getFileFromCDN,
    sendTelegramNotification,
    fileCache,
    uploadLocks
}
