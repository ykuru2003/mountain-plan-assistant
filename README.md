# Yamareco Plan Builder

Yamarecoの公開計画を読み取り、Web検索で不足情報を補い、確認・編集可能な山行計画書をWord形式で出力するアプリです。

## 必要環境

- Node.js `>=22.13.0`
- npm

## ローカル起動

```bash
npm ci
npm run dev
```

開発サーバーは通常 `http://127.0.0.1:5173` で起動します。

AIによる情報補完を有効にする場合は、Git管理対象外の `.env.local` に `OPENAI_API_KEY` を設定します。未設定時はYamarecoの公開情報だけを使うデモモードで動作します。

## 主な構成

- `app/`: 画面とAPIルート
- `lib/`: 山行計画型、履歴管理、Word生成
- `public/templates/`: Wordテンプレート
- `worker/`: Cloudflare Workerエントリ
- `build/`: Sites成果物のパッケージ処理
- `tests/`: 要件・画面・Word出力テスト

## コマンド

- `npm run dev`: 開発サーバーを起動
- `npm run build`: Sites向け本番成果物を生成・検証
- `npm run start`: 本番ビルドを起動
- `npm test`: 本番ビルドと全テストを実行
- `npm run lint`: ESLintによる静的解析
- `npm run typecheck`: TypeScript型チェック
- `npm run validate:artifact`: 生成済みSites成果物を再検証

## デプロイ

`.openai/hosting.json` と `vite.config.ts` により、VinextアプリをCloudflare Worker形式でパッケージします。リモートビルダーでは `npm run build` を実行してください。
