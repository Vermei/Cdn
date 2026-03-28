const crypto = require('crypto')
const cryptoJs = require('crypto-js')
const { fromBuffer } = require('file-type')

const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
]
const maxFileSize = 25 * 1024 * 1024

function createHash(data) {
    return cryptoJs.SHA256(data).toString()
}

function createSecureHash(data) {
    return crypto.createHash('sha256').update(data).digest('hex')
}

function validateSession(clientIp, userAgent, githubToken, sessionCookie) {
    const expectedSession = createHash(clientIp + '|' + userAgent + '|' + githubToken)
    return sessionCookie === expectedSession
}

function generateSessionToken(clientIp, userAgent, githubToken) {
    return createHash(clientIp + '|' + userAgent + '|' + githubToken)
}

function validateFileType(mimeType) {
    return allowedTypes.includes(mimeType)
}

async function validateFileBuffer(buffer) {
    if (!buffer || buffer.length === 0) {
        return { valid: false, message: 'File is empty' }
    }
    
    if (buffer.length > maxFileSize) {
        return { valid: false, message: 'File size exceeds 25MB limit' }
    }
    
    const fileType = await fromBuffer(buffer)
    if (!fileType) {
        return { valid: false, message: 'Cannot detect file type' }
    }
    
    if (!validateFileType(fileType.mime)) {
        return { valid: false, message: 'File type ' + fileType.mime + ' is not supported' }
    }
    
    return { valid: true, mime: fileType.mime, ext: fileType.ext }
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for']
    if (forwarded) {
        return forwarded.split(',')[0].trim()
    }
    return req.socket.remoteAddress
}

function maskIp(ip) {
    if (!ip) return 'unknown'
    const parts = ip.split('.')
    if (parts.length === 4) {
        return parts[0] + '.' + parts[1] + '.' + parts[2] + '.xxx'
    }
    return createSecureHash(ip).substring(0, 12)
}

module.exports = {
    createHash,
    createSecureHash,
    validateSession,
    generateSessionToken,
    validateFileType,
    validateFileBuffer,
    getClientIp,
    maskIp,
    allowedTypes,
    maxFileSize
}
