require('dotenv').config();
const express = require('express');
const multer = require('multer');
const crypto = require('crypto-js');
const { fromBuffer } = require('file-type');
const path = require('path');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const token = process.env.token || '';
const username = process.env.username || '';
const nameRepo = process.env.nameRepo || 'dtbsegh';
const port = process.env.port || 3000;
const repo = `${username}/${nameRepo}`;

const hashMap = new Map();
const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function sha256(buffer) {
  const wordArray = crypto.lib.WordArray.create(buffer);
  return crypto.SHA256(wordArray).toString();
}

function randomName(ext) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let name = '';
  for (let i = 0, len = Math.floor(Math.random() * 2) + 3; i < len; i++) {
    name += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${name}.${ext}`;
}

async function setupRepo() {
  console.log(`Mengecek repositori: ${repo}`);
  try {
    const checkRes = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        Authorization: `token ${token}`,
        'User-Agent': 'Node.js-Uploader-Setup'
      }
    });

    if (checkRes.status === 200) {
      console.log('Repositori sudah ada. Setup selesai.');
      return;
    }

    if (checkRes.status === 404) {
      console.log('Repositori tidak ditemukan, mencoba membuat...');
      const createRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Node.js-Uploader-Setup'
        },
        body: JSON.stringify({
          name: nameRepo,
          private: false,
          description: 'Database file untuk uploader'
        })
      });

      const createJson = await createRes.json();
      if (createRes.ok) {
        console.log(`Repositori ${createJson.full_name} berhasil dibuat.`);
      } else {
        throw new Error(createJson.message || 'Gagal membuat repositori');
      }
    } else {
      const errorJson = await checkRes.json();
      throw new Error(errorJson.message || 'Gagal memverifikasi repositori');
    }
  } catch (e) {
    console.error('Error saat setup repositori:', e.message);
    process.exit(1);
  }
}

async function uploadToGitHub(buffer) {
  const hash = sha256(buffer);
  if (hashMap.has(hash)) return hashMap.get(hash);

  const fileInfo = await fromBuffer(buffer);
  if (!fileInfo || !allowedMimes.includes(fileInfo.mime)) {
    throw new Error('Tipe file tidak didukung');
  }

  const { ext } = fileInfo;
  const filename = `/${randomName(ext)}`;
  const url = `https://api.github.com/repos/${repo}/contents/${filename}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Node.js-Uploader'
    },
    body: JSON.stringify({
      message: `upload ${filename}`,
      content: buffer.toString('base64'),
      branch: 'main'
    })
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'GitHub error');

  const result = {
    filename: json.content.name,
    url: `/${json.content.path}`
  };

  hashMap.set(hash, result);
  return result;
}

app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'docs.html'));
});

app.get('/info', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'info.html'));
});

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: false, message: 'Tidak ada file yang diupload' });
    }
    const result = await uploadToGitHub(req.file.buffer);
    const fullUrl = `${req.protocol}://${req.get('host')}${result.url}`;
    
    res.json({
      status: true,
      filename: result.filename,
      url: fullUrl
    });
  } catch (e) {
    res.status(500).json({ status: false, message: e.message || 'Upload failed' });
  }
});

app.get('/f/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const remoteUrl = `https://cdn.jsdelivr.net/gh/${repo}@main/${filename}`;

    const requestHeaders = {};
    if (req.headers.range) {
      requestHeaders['Range'] = req.headers.range;
    }

    const response = await fetch(remoteUrl, {
      headers: requestHeaders
    });

    if (!response.ok) {
      return res.sendStatus(response.status);
    }

    const responseHeaders = {};
    response.headers.forEach((value, name) => {
      if (['content-length', 'content-type', 'accept-ranges', 'content-range'].includes(name.toLowerCase())) {
        responseHeaders[name] = value;
      }
    });

    res.writeHead(response.status, responseHeaders);
    response.body.pipe(res);

  } catch (e) {
    res.status(500).json({ error: e.message || 'Streaming failed' });
  }
});

if (require.main === module) {
  (async () => {
    await setupRepo();
    app.listen(port, () => {
      console.log(`Lokal aktif di http://localhost:${port}`);
    });
  })();
}

module.exports = app;
