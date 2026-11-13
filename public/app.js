// 画面側の処理
const $ = (id) => document.getElementById(id);
let state = { memos: [], tasks: [], reviews: [] };

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text; // textContent で XSS を防ぐ
  return e;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'エラーが発生しました');
  return json;
}

async function reload() {
  state = await api('GET', '/api/data');
  render();
}

function render() {
  // ダッシュボード
  $('memoCount').textContent = state.memos.length;
  $('taskCount').textContent = state.tasks.length;
  $('doneCount').textContent = state.tasks.filter((t) => t.done).length;
  $('openCount').textContent = state.tasks.filter((t) => !t.done).length;

  // メモ一覧
  const memoList = $('memoList');
  memoList.replaceChildren();
  if (state.memos.length === 0) memoList.append(el('li', 'empty', 'メモはまだありません'));
  for (const m of state.memos) {
    const li = el('li');
    li.append(el('div', 'memo-title', m.title));
    if (m.content) li.append(el('div', 'memo-body', m.content));
    li.append(el('div', 'meta', `作成日時: ${formatDate(m.createdAt)}`));
    memoList.append(li);
  }

  // タスク一覧
  const taskList = $('taskList');
  taskList.replaceChildren();
  if (state.tasks.length === 0) taskList.append(el('li', 'empty', 'タスクはまだありません'));
  for (const t of state.tasks) {
    const li = el('li', 'task' + (t.done ? ' done' : ''));
    const info = el('div', 'info');
    const titleRow = el('div');
    titleRow.append(el('span', 'badge ' + (t.done ? 'done' : 'open'), t.done ? '完了' : '未完了'));
    titleRow.append(el('span', 'task-title', t.title));
    info.append(titleRow);
    let meta = `作成日時: ${formatDate(t.createdAt)}`;
    if (t.done && t.completedAt) meta += ` ／ 完了日時: ${formatDate(t.completedAt)}`;
    info.append(el('div', 'meta', meta));

    const actions = el('div', 'actions');
    const toggleBtn = el('button', 'small ' + (t.done ? 'secondary' : 'complete'), t.done ? '未完了に戻す' : '完了');
    toggleBtn.onclick = () => run(() => api('POST', `/api/tasks/${t.id}/toggle`));
    const delBtn = el('button', 'small danger', '削除');
    delBtn.onclick = () => {
      if (confirm(`「${t.title}」を削除しますか？`)) run(() => api('DELETE', `/api/tasks/${t.id}`));
    };
    actions.append(toggleBtn, delBtn);

    li.append(info, actions);
    taskList.append(li);
  }

  renderReviews();
}

// ---- 週次の振り返り ----
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// Date をローカル日付の 'YYYY-MM-DD' に
function ymd(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// 'YYYY-MM-DD' をローカル日付の Date に
function parseYmd(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
// その日を含む週の月曜日
function mondayOf(str) {
  const d = parseYmd(str);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}
// 週の表示（例：2026/11/09(月)〜11/15(日)）
function weekLabel(weekStart) {
  const s = parseYmd(weekStart);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  const f = (d) => `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}(${WEEKDAYS[d.getDay()]})`;
  return `${s.getFullYear()}/${f(s)}〜${f(e)}`;
}
// その週に追加・完了したタスク数
function weekStats(weekStart) {
  const start = parseYmd(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const inWeek = (iso) => iso && new Date(iso) >= start && new Date(iso) < end;
  return {
    added: state.tasks.filter((t) => inWeek(t.createdAt)).length,
    completed: state.tasks.filter((t) => t.done && inWeek(t.completedAt)).length,
  };
}
function statsText(weekStart) {
  const st = weekStats(weekStart);
  return `この週に追加したタスク: ${st.added}件 ／ 完了したタスク: ${st.completed}件`;
}

// 対象の週が変わったら表示を更新し、保存済みのコメントがあれば読み込む
function updateReviewForm(loadComment) {
  const date = $('reviewDate').value;
  if (!date) return;
  const weekStart = mondayOf(date);
  const existing = state.reviews.find((r) => r.weekStart === weekStart);
  $('reviewWeekLabel').textContent = weekLabel(weekStart);
  $('reviewWeekStats').textContent = statsText(weekStart);
  $('reviewSubmit').textContent = existing ? '振り返りを更新' : '振り返りを保存';
  if (loadComment) $('reviewComment').value = existing ? existing.comment : '';
}

function renderReviews() {
  // ダッシュボードの最新の振り返り（いちばん新しい週）
  const latest = state.reviews[0];
  $('latestWeek').textContent = latest ? weekLabel(latest.weekStart) : '';
  const latestComment = $('latestComment');
  latestComment.textContent = latest ? latest.comment : 'まだ振り返りはありません。下の「週次の振り返り」から記録できます。';
  latestComment.classList.toggle('empty-text', !latest);

  // 振り返り一覧
  const list = $('reviewList');
  list.replaceChildren();
  if (state.reviews.length === 0) list.append(el('li', 'empty', '振り返りはまだありません'));
  for (const r of state.reviews) {
    const li = el('li', 'review');
    const head = el('div', 'review-head');
    head.append(el('span', 'review-week', weekLabel(r.weekStart)));
    const editBtn = el('button', 'small secondary', '編集');
    editBtn.onclick = () => {
      $('reviewDate').value = r.weekStart;
      updateReviewForm(true);
      $('reviewForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('reviewComment').focus();
    };
    head.append(editBtn);
    li.append(head);
    li.append(el('div', 'memo-body', r.comment));
    let meta = `${statsText(r.weekStart)} ／ 記録日時: ${formatDate(r.createdAt)}`;
    if (r.updatedAt && r.updatedAt !== r.createdAt) meta += ` ／ 更新日時: ${formatDate(r.updatedAt)}`;
    li.append(el('div', 'meta', meta));
    list.append(li);
  }

  updateReviewForm(false);
}

// 操作を実行して画面を更新
async function run(fn) {
  try {
    await fn();
    await reload();
  } catch (e) {
    alert(e.message);
  }
}

$('memoForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('memoTitle').value;
  const content = $('memoContent').value;
  run(async () => {
    await api('POST', '/api/memos', { title, content });
    $('memoForm').reset();
  });
});

$('taskForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('taskTitle').value;
  run(async () => {
    await api('POST', '/api/tasks', { title });
    $('taskForm').reset();
  });
});

$('reviewDate').value = ymd(new Date()); // 初期値は今週
$('reviewDate').addEventListener('change', () => updateReviewForm(true));

$('reviewForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const date = $('reviewDate').value;
  const comment = $('reviewComment').value;
  run(() => api('POST', '/api/reviews', { date, comment }));
});

reload().then(() => updateReviewForm(true)).catch((e) => alert('データの読み込みに失敗しました: ' + e.message));
