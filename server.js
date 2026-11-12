// 自分専用の秘書アプリ（外部ライブラリ不要の Node.js サーバー）
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---- データの読み書き ----
function loadData() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return { memos: data.memos || [], tasks: data.tasks || [], reviews: data.reviews || [] };
  } catch {
    return { memos: [], tasks: [], reviews: [] };
  }
}

function saveData(data) {
  // 一時ファイルに書いてから置き換えることで、書き込み途中の破損を防ぐ
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

let data = loadData();

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

// 'YYYY-MM-DD' を受け取り、その週の月曜日を 'YYYY-MM-DD' で返す（不正なら null）
function toMonday(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(d)) return null;
  const diff = (d.getUTCDay() + 6) % 7; // 月曜=0 … 日曜=6
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
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

// ---- API ----
async function handleApi(req, res) {
  const url = req.url.split('?')[0];
  const method = req.method;

  // 全データ取得
  if (method === 'GET' && url === '/api/data') {
    return sendJson(res, 200, data);
  }

  // メモ追加
  if (method === 'POST' && url === '/api/memos') {
    const body = await readBody(req);
    const title = String(body.title || '').trim();
    const content = String(body.content || '').trim();
    if (!title) return sendJson(res, 400, { error: 'タイトルを入力してください' });
    const memo = { id: crypto.randomUUID(), title, content, createdAt: new Date().toISOString() };
    data.memos.unshift(memo);
    saveData(data);
    return sendJson(res, 201, memo);
  }

  // タスク追加
  if (method === 'POST' && url === '/api/tasks') {
    const body = await readBody(req);
    const title = String(body.title || '').trim();
    if (!title) return sendJson(res, 400, { error: 'タスクを入力してください' });
    const task = {
      id: crypto.randomUUID(),
      title,
      done: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    data.tasks.unshift(task);
    saveData(data);
    return sendJson(res, 201, task);
  }

  // 週次の振り返りを保存（同じ週はコメントを上書き）
  if (method === 'POST' && url === '/api/reviews') {
    const body = await readBody(req);
    const weekStart = toMonday(String(body.date || ''));
    const comment = String(body.comment || '').trim();
    if (!weekStart) return sendJson(res, 400, { error: '週を選択してください' });
    if (!comment) return sendJson(res, 400, { error: '振り返りコメントを入力してください' });
    const now = new Date().toISOString();
    let review = data.reviews.find((r) => r.weekStart === weekStart);
    if (review) {
      review.comment = comment;
      review.updatedAt = now;
    } else {
      review = { id: crypto.randomUUID(), weekStart, comment, createdAt: now, updatedAt: now };
      data.reviews.push(review);
    }
    data.reviews.sort((a, b) => b.weekStart.localeCompare(a.weekStart)); // 新しい週が先頭
    saveData(data);
    return sendJson(res, 200, review);
  }

  // タスク完了／未完了の切り替え・削除
  const m = url.match(/^\/api\/tasks\/([\w-]+)(\/toggle)?$/);
  if (m) {
    const task = data.tasks.find((t) => t.id === m[1]);
    if (!task) return sendJson(res, 404, { error: 'タスクが見つかりません' });

    if (method === 'POST' && m[2]) {
      task.done = !task.done;
      task.completedAt = task.done ? new Date().toISOString() : null;
      saveData(data);
      return sendJson(res, 200, task);
    }
    if (method === 'DELETE' && !m[2]) {
      data.tasks = data.tasks.filter((t) => t.id !== task.id);
      saveData(data);
      return sendJson(res, 200, { ok: true });
    }
  }

  return sendJson(res, 404, { error: 'not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) return await handleApi(req, res);
    return serveStatic(req, res);
  } catch (e) {
    return sendJson(res, 400, { error: '不正なリクエストです' });
  }
});

server.listen(PORT, () => {
  console.log(`秘書アプリを起動しました: http://localhost:${PORT}`);
  console.log(`データ保存先: ${DATA_FILE}`);
});
