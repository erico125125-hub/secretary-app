// 自分専用の秘書アプリ：パソコンで動かすためのサーバー（外部ライブラリ不要）
// Cloudflare Pages では、このファイルの代わりに functions/api/[[path]].js が動きます。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi, normalize } from './lib/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---- 保存先：data.json ----
const fileStore = {
  async load() {
    try {
      return normalize(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
    } catch {
      return normalize(null);
    }
  },
  async save(data) {
    // 一時ファイルに書いてから置き換えることで、書き込み途中の破損を防ぐ
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
  },
};

// ---- ユーティリティ ----
function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) reject(new Error('too large'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };

function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'forbidden' });
  fs.readFile(filePath, (err, content) => {
    if (err) return sendJson(res, 404, { error: 'not found' });
    const type = MIME[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      const body = req.method === 'GET' ? {} : await readBody(req);
      const result = await handleApi(req.method, req.url.split('?')[0], body, fileStore);
      return sendJson(res, result.status, result.body);
    }
    return serveStatic(req, res);
  } catch (e) {
    return sendJson(res, 400, { error: '不正なリクエストです' });
  }
});

server.listen(PORT, () => {
  console.log(`秘書アプリを起動しました: http://localhost:${PORT}`);
  console.log(`データ保存先: ${DATA_FILE}`);
});
