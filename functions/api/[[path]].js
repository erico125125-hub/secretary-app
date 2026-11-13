// Cloudflare Pages Functions：/api/ 以下のリクエストをすべてここで処理します。
// データは Workers KV（バインディング名 DATA）に保存します。
import { handleApi, normalize } from '../../lib/api.js';

const KEY = 'data'; // KV に保存するキー（データ全体を1つの JSON として保存）

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequest({ request, env }) {
  if (!env.DATA) {
    return json(500, {
      error:
        '保存先（KV）が設定されていません。Cloudflare の Pages プロジェクトの「設定 → バインディング」で、変数名 DATA の KV 名前空間を追加してください。',
    });
  }

  const kvStore = {
    async load() {
      return normalize(await env.DATA.get(KEY, 'json'));
    },
    async save(data) {
      await env.DATA.put(KEY, JSON.stringify(data));
    },
  };

  try {
    let body = {};
    if (request.method !== 'GET') {
      const text = await request.text();
      if (text.length > 1e6) return json(413, { error: 'データが大きすぎます' });
      body = text ? JSON.parse(text) : {};
    }
    const path = new URL(request.url).pathname;
    const result = await handleApi(request.method, path, body, kvStore);
    return json(result.status, result.body);
  } catch (e) {
    return json(400, { error: '不正なリクエストです' });
  }
}
