const crypto = require('crypto')

const rateLimitStore = new Map()
const ipBlockList = new Set()
const fingerprintStore = new Map()

const rateLimitWindow = 60000
const rateLimitMaxGeneral = 60
const rateLimitMaxUpload = 30
const rateLimitMaxApi = 20
const blockDuration = 600000
const spamThreshold = 30
const maxFingerprintStore = 10000
const maxRateLimitStore = 5000

function createHash(data) {
    return crypto.createHash('sha256').update(data).digest('hex')
}

function generateFingerprint(req) {
    const clientIp = getClientIp(req)
    const userAgent = req.headers['user-agent'] || ''
    const acceptLanguage = req.headers['accept-language'] || ''
    const acceptEncoding = req.headers['accept-encoding'] || ''

    const fingerprintData = clientIp + '|' + userAgent + '|' + acceptLanguage + '|' + acceptEncoding
    const fingerprint = createHash(fingerprintData).substring(0, 32)

    const now = Date.now()
    const existing = fingerprintStore.get(fingerprint)

    if (existing) {
        const count = existing.count + 1
        const firstSeen = existing.firstSeen
        fingerprintStore.set(fingerprint, { count, firstSeen, lastSeen: now })
        
        if (fingerprintStore.size > maxFingerprintStore) {
            const firstKey = fingerprintStore.keys().next().value
            fingerprintStore.delete(firstKey)
        }
        
        return { 
            fingerprint, 
            isSuspicious: count > spamThreshold, 
            requestCount: count 
        }
    } else {
        fingerprintStore.set(fingerprint, { count: 1, firstSeen: now, lastSeen: now })
        
        if (fingerprintStore.size > maxFingerprintStore) {
            const firstKey = fingerprintStore.keys().next().value
            fingerprintStore.delete(firstKey)
        }
        
        return { fingerprint, isSuspicious: false, requestCount: 1 }
    }
}

function checkRateLimit(ip, limit = rateLimitMaxGeneral) {
    const now = Date.now()
    const existing = rateLimitStore.get(ip)

    if (existing) {
        if (now - existing.windowStart > rateLimitWindow) {
            rateLimitStore.set(ip, { count: 1, windowStart: now })
            return { allowed: true, remaining: limit - 1 }
        }

        if (existing.count >= limit) {
            return { 
                allowed: false, 
                remaining: 0, 
                retryAfter: Math.ceil((existing.windowStart + rateLimitWindow - now) / 1000) 
            }
        }

        existing.count++
        rateLimitStore.set(ip, existing)
        return { allowed: true, remaining: limit - existing.count }
    } else {
        rateLimitStore.set(ip, { count: 1, windowStart: now })
        
        if (rateLimitStore.size > maxRateLimitStore) {
            const firstKey = rateLimitStore.keys().next().value
            rateLimitStore.delete(firstKey)
        }
        
        return { allowed: true, remaining: limit - 1 }
    }
}

function blockIP(ip) {
    ipBlockList.add(ip)
    rateLimitStore.delete(ip)

    setTimeout(() => {
        ipBlockList.delete(ip)
    }, blockDuration)
}

function isBlocked(ip) {
    return ipBlockList.has(ip)
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for']
    if (forwarded) {
        return forwarded.split(',')[0].trim()
    }
    return req.socket.remoteAddress
}

function generalMiddleware(req, res, next) {
    const clientIp = getClientIp(req)

    if (isBlocked(clientIp)) {
        return res.status(429).json({
            status: false,
            message: 'Too many requests. Please try again later.'
        })
    }

    const rateLimit = checkRateLimit(clientIp, rateLimitMaxGeneral)
    if (!rateLimit.allowed) {
        return res.status(429).json({
            status: false,
            message: 'Rate limit exceeded. Please slow down.',
            retryAfter: rateLimit.retryAfter
        })
    }

    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining)
    res.setHeader('X-RateLimit-Limit', rateLimitMaxGeneral)

    const fingerprint = generateFingerprint(req)
    req.fingerprint = fingerprint.fingerprint
    req.fingerprintInfo = fingerprint

    next()
}

function uploadMiddleware(req, res, next) {
    const clientIp = getClientIp(req)

    if (isBlocked(clientIp)) {
        return res.status(429).json({
            status: false,
            message: 'Too many requests. Please try again later.'
        })
    }

    const rateLimit = checkRateLimit(clientIp, rateLimitMaxUpload)
    if (!rateLimit.allowed) {
        blockIP(clientIp)
        return res.status(429).json({
            status: false,
            message: 'Upload rate limit exceeded. Please try again later.',
            retryAfter: rateLimit.retryAfter
        })
    }

    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining)
    res.setHeader('X-RateLimit-Limit', rateLimitMaxUpload)

    next()
}

function apiMiddleware(req, res, next) {
    const clientIp = getClientIp(req)

    if (isBlocked(clientIp)) {
        return res.status(429).json({
            status: false,
            message: 'Too many requests. Please try again later.'
        })
    }

    const rateLimit = checkRateLimit(clientIp, rateLimitMaxApi)
    if (!rateLimit.allowed) {
        return res.status(429).json({
            status: false,
            message: 'API rate limit exceeded. Please try again later.',
            retryAfter: rateLimit.retryAfter
        })
    }

    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining)
    res.setHeader('X-RateLimit-Limit', rateLimitMaxApi)

    next()
}

function cleanup() {
    const now = Date.now()
    const cleanupThreshold = rateLimitWindow * 2

    for (const [ip, data] of rateLimitStore.entries()) {
        if (now - data.windowStart > cleanupThreshold) {
            rateLimitStore.delete(ip)
        }
    }

    for (const [fingerprint, data] of fingerprintStore.entries()) {
        if (now - data.lastSeen > cleanupThreshold) {
            fingerprintStore.delete(fingerprint)
        }
    }
}

setInterval(cleanup, rateLimitWindow)

module.exports = {
    generalMiddleware,
    uploadMiddleware,
    apiMiddleware,
    generateFingerprint,
    checkRateLimit,
    blockIP,
    isBlocked,
    getClientIp,
    createHash,
    rateLimitStore,
    ipBlockList,
    fingerprintStore
}
