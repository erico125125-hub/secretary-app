# 自分専用の秘書アプリ

メモとタスクを管理できるシンプルな Node.js アプリです。外部ライブラリは不要です。

## 起動方法

```bash
cd secretary-app
npm start
```

ブラウザで http://localhost:3000 を開いてください。

## 機能

- ダッシュボード：メモ件数・タスク件数・完了タスク件数・未完了タスク件数・最新の振り返り
- メモ：タイトル・本文を入力して追加、一覧表示（作成日時つき）
- タスク：追加、一覧表示（作成日時・完了状態）、完了／未完了の切り替え、削除
- 週次の振り返り：週を選んでコメントを記録（同じ週は上書き更新）、一覧表示、編集。その週に追加・完了したタスク数も表示

## データの保存

データは `data.json` に保存されます。アプリを閉じても内容は残ります。

## Cloudflare Pages で公開する

Cloudflare Pages では `server.js` の代わりに `functions/api/[[path]].js` が動き、データは Workers KV に保存されます。
API の処理本体は `lib/api.js` にあり、パソコン版と Cloudflare 版で共通です。

1. Cloudflare ダッシュボードで KV 名前空間を作成（例：`secretary-data`）
2. Workers & Pages → 作成 → Pages → Git に接続 → このリポジトリを選択
   - フレームワーク プリセット：なし
   - ビルドコマンド：（空欄）
   - ビルド出力ディレクトリ：`public`
3. プロジェクトの 設定 → バインディング で KV 名前空間を追加
   - 変数名：`DATA` ／ KV 名前空間：手順1で作成したもの
   - 追加後、最新のデプロイを「再試行」して反映
4. 個人のデータを守るため、Cloudflare Access で自分だけがアクセスできるように制限する

## ファイル構成

| ファイル | 役割 |
|---|---|
| `lib/api.js` | API の処理（メモ・タスク・振り返り）。パソコン版と Cloudflare 版で共通 |
| `server.js` | パソコン用サーバー（`data.json` に保存） |
| `functions/api/[[path]].js` | Cloudflare Pages Functions（Workers KV に保存） |
| `public/` | 画面（HTML・CSS・JavaScript） |
