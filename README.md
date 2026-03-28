# Fik Uploader v2.3

File uploader service powered by GitHub Storage + jsDelivr CDN. Upload images and videos with a clean, boxy UI.

![Version](https://img.shields.io/badge/version-2.3-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

- **🚀 Fast Upload** - Files stored on GitHub, served via jsDelivr CDN
- **🔓 Public API** - No authentication required for API uploads
- **📦 25MB Limit** - Per file upload size
- **🌍 Global CDN** - Fast delivery worldwide
- **🎨 Boxy UI** - Clean, retro-inspired design
- **📱 Responsive** - Works on desktop and mobile
- **🔔 Telegram Notifications** - Get notified on every upload

## 📋 Supported File Types

| Type | Extensions |
|------|------------|
| Images | JPEG, PNG, WebP, GIF |
| Videos | MP4, WebM, MOV |

## 🚀 Quick Start

### Local Development

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/Uploader.git
cd Uploader
```

2. **Install dependencies**
```bash
npm install
```

3. **Create `.env` file**
```env
username=your_github_username
token=your_github_token
nameRepo=your_repo_name
tokenBot=your_telegram_bot_token
chatId=your_telegram_chat_id
PORT=3000
```

4. **Start the server**
```bash
npm start
```

5. **Open in browser**
```
http://localhost:3000
```

## 🔧 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `username` | Your GitHub username | ✅ |
| `token` | GitHub Personal Access Token (repo scope) | ✅ |
| `nameRepo` | GitHub repository name for storage | ✅ |
| `tokenBot` | Telegram Bot Token | ❌ |
| `chatId` | Telegram Chat ID for notifications | ❌ |
| `PORT` | Server port (default: 3000) | ❌ |

### Getting GitHub Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo` (full control of private repositories)
4. Generate and copy the token

### Getting Telegram Bot Token

1. Message @BotFather on Telegram
2. Send `/newbot` and follow instructions
3. Copy the bot token

### Getting Telegram Chat ID

1. Message @userinfobot on Telegram
2. It will reply with your chat ID

## 🌐 Deploy to Vercel

### Option 1: Vercel Dashboard

1. **Push code to GitHub**
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. **Go to Vercel**
   - Visit https://vercel.com
   - Click "New Project"
   - Import your GitHub repository

3. **Configure Environment Variables**
   - Go to Settings → Environment Variables
   - Add all variables from `.env` section above

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete

### Option 2: Vercel CLI

1. **Install Vercel CLI**
```bash
npm i -g vercel
```

2. **Login to Vercel**
```bash
vercel login
```

3. **Deploy**
```bash
vercel
```

4. **Add Environment Variables**
```bash
vercel env add username
vercel env add token
vercel env add nameRepo
vercel env add tokenBot
vercel env add chatId
vercel env add PORT
```

5. **Deploy to Production**
```bash
vercel --prod
```

## 📡 API Documentation

### Base URL
```
https://njy.my.id
```

### Endpoints

#### POST /api/upload
Upload file (public API - no authentication required)

**Request:**
```bash
curl -X POST https://njy.my.id/api/upload \
  -F "file=@image.jpg"
```

**Response:**
```json
{
  "status": true,
  "result": {
    "name": "abc.jpg",
    "url": "https://njy.my.id/files/abc.jpg",
    "mime": "image/jpeg",
    "isNew": true
  }
}
```

#### GET /files/:filename
Retrieve uploaded file via CDN

```bash
curl https://njy.my.id/files/abc.jpg
```

#### GET /health
Health check endpoint

```bash
curl https://njy.my.id/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-03-28T14:00:00.000Z",
  "uptime": 3600.5
}
```

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| API Upload | 20 requests/minute |
| File Download | Unlimited (CDN cached) |

## 💻 Usage Examples

### JavaScript (Frontend)
```javascript
const fd = new FormData()
fd.append('file', fileInput.files[0])

const res = await fetch('/api/upload', {
  method: 'POST',
  body: fd
})

const data = await res.json()
console.log(data.result.url)
```

### Python
```python
import requests

files = {'file': open('image.jpg', 'rb')}
res = requests.post('https://njy.my.id/api/upload', files=files)

print(res.json()['result']['url'])
```

### Node.js
```javascript
const FormData = require('form-data')
const fetch = require('node-fetch')
const fs = require('fs')

const form = new FormData()
form.append('file', fs.createReadStream('image.jpg'))

const res = await fetch('https://njy.my.id/api/upload', {
  method: 'POST',
  body: form
})

const data = await res.json()
console.log(data.result.url)
```

## 📁 Project Structure

```
Uploader/
├── server.js              # Main Express server
├── package.json           # Dependencies
├── vercel.json            # Vercel configuration
├── .env                   # Environment variables (DO NOT COMMIT)
├── .gitignore             # Git ignore rules
├── lib/
│   ├── githubController.js    # GitHub API integration
│   ├── securityController.js  # Rate limiting & middleware
│   └── validateController.js  # File & session validation
├── assets/
│   ├── app.js           # React frontend
│   └── style.css        # Boxy design styles
└── public/
    ├── index.html       # Upload page
    └── docs.html        # API documentation
```

## 🔒 Security Features

- **Rate Limiting** - 60 req/min general, 20 req/min API upload
- **IP Blocking** - Automatic block for abuse
- **File Validation** - MIME type checking before upload
- **File Size Limit** - Max 25MB per file
- **Duplicate Detection** - SHA256 hash caching

## ⚠️ Important Notes

1. **Never commit `.env` file** - It contains sensitive credentials
2. **GitHub repo must be public** - jsDelivr CDN requires public repos
3. **GitHub API rate limit** - 5000 requests/hour for authenticated users
4. **Telegram notifications are optional** - Service works without them

## 🛠️ Troubleshooting

### Upload fails with "File type not supported"
- Only JPEG, PNG, WebP, GIF, MP4, WebM, MOV are allowed
- File must have valid MIME type

### "Rate limit exceeded" error
- Wait 1 minute before trying again
- API limit is 20 uploads per minute per IP

### Telegram notification not working
- Check `tokenBot` and `chatId` in `.env`
- Bot must be added to your chat/channel

### Vercel deployment fails
- Ensure all environment variables are set
- Check `vercel.json` configuration
- Review build logs in Vercel dashboard

## 📄 License

MIT License - feel free to use for personal or commercial projects.

## 🙏 Credits

- **GitHub** - File storage
- **jsDelivr** - CDN delivery
- **Telegram** - Upload notifications
- **Express** - Backend framework
- **React** - Frontend UI

---

**Made by Fik**
