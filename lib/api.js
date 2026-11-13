// API の処理本体（パソコン用の server.js と Cloudflare Pages Functions の両方から使う）
//
// store は保存先の違いを吸収するオブジェクトです。
//   store.load()      … { memos, tasks, reviews } を返す
//   store.save(data)  … データ全体を保存する
// パソコンでは data.json、Cloudflare では Workers KV に保存します。

export function normalize(data) {
  return {
    memos: (data && data.memos) || [],
    tasks: (data && data.tasks) || [],
    reviews: (data && data.reviews) || [],
  };
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

const res = (status, body) => ({ status, body });

/**
 * @param {string} method  HTTP メソッド
 * @param {string} path    '/api/...' 形式のパス
 * @param {object} body    リクエスト本文（JSON を解析したもの）
 * @param {{load: Function, save: Function}} store
 * @returns {Promise<{status: number, body: any}>}
 */
export async function handleApi(method, path, body, store) {
  // 全データ取得
  if (method === 'GET' && path === '/api/data') {
    return res(200, await store.load());
  }

  // メモ追加
  if (method === 'POST' && path === '/api/memos') {
    const title = String(body.title || '').trim();
    const content = String(body.content || '').trim();
    if (!title) return res(400, { error: 'タイトルを入力してください' });
    const data = await store.load();
    const memo = { id: crypto.randomUUID(), title, content, createdAt: new Date().toISOString() };
    data.memos.unshift(memo);
    await store.save(data);
    return res(201, memo);
  }

  // タスク追加
  if (method === 'POST' && path === '/api/tasks') {
    const title = String(body.title || '').trim();
    if (!title) return res(400, { error: 'タスクを入力してください' });
    const data = await store.load();
    const task = {
      id: crypto.randomUUID(),
      title,
      done: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    data.tasks.unshift(task);
    await store.save(data);
    return res(201, task);
  }

  // 週次の振り返りを保存（同じ週はコメントを上書き）
  if (method === 'POST' && path === '/api/reviews') {
    const weekStart = toMonday(String(body.date || ''));
    const comment = String(body.comment || '').trim();
    if (!weekStart) return res(400, { error: '週を選択してください' });
    if (!comment) return res(400, { error: '振り返りコメントを入力してください' });
    const data = await store.load();
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
    await store.save(data);
    return res(200, review);
  }

  // タスク完了／未完了の切り替え・削除
  const m = path.match(/^\/api\/tasks\/([\w-]+)(\/toggle)?$/);
  if (m) {
    const data = await store.load();
    const task = data.tasks.find((t) => t.id === m[1]);
    if (!task) return res(404, { error: 'タスクが見つかりません' });

    if (method === 'POST' && m[2]) {
      task.done = !task.done;
      task.completedAt = task.done ? new Date().toISOString() : null;
      await store.save(data);
      return res(200, task);
    }
    if (method === 'DELETE' && !m[2]) {
      data.tasks = data.tasks.filter((t) => t.id !== task.id);
      await store.save(data);
      return res(200, { ok: true });
    }
  }

  return res(404, { error: 'not found' });
}
