# vinext-starter

[vinext](https://github.com/cloudflare/vinext) 上で動作する、クリーンなフルスタックのスターターテンプレートです。オプションで Cloudflare D1 および Drizzle をサポートしています。

## 前提条件

- Node.js `>=22.13.0`
- `flock`、`curl`、および GNU `timeout` を備えた Linux

## サイトのライフサイクル (Sites Lifecycle)

Sites ライフサイクル CLI は、このチェックアウトを返す前にロックされた依存関係のインストールを実行します。`app/` 配下のソースを編集し、検査や共有の準備が整った一貫したマイルストーンに達したときにチェックポイントを作成してください。リモートの Sites ビルダーは、プッシュされたコミットに対して `npm run build` を実行します。通常の事前チェックポイントステップとして、インストールやビルドを繰り返さないでください。

このスターターは `wrangler.jsonc` を使用しません。

`install:ci` は意図的に、再試行を行わない単一の `npm ci` となっています。同じプロジェクトに対する並行インストールを拒否し、`--prefer-offline` を使用してイメージにシードされた npm キャッシュを消費しつつ、キャッシュオブジェクトが見つからない場合はレジストリへのフォールバックを維持します。それ以外の場合は、`package-lock.json` に記録されている完全な vinext ターボールをダウンロードして検証し、npm のソケット数を1つに制限し、停滞したインストールを強制終了します。`build` は短いタイムアウトを適用し、その後 Sites アーティファクトを検証します。これらのヘルパーは Linux を対象としており、GNU `timeout` を使用しています。ネイティブの macOS スクリプトではありません。

書き込み可能なプロジェクトスコープの home、npm、XDG、および一時パスを必要とするスクリプトは、`scripts/sites-env.sh` を使用します。`dev` および `start` スクリプトは、呼び出し元のランタイム環境を尊重し、Wrangler のログをチェックアウト内に保持します。生成される `.sites-runtime/` ディレクトリは使い捨てであり、Git によって無視されます。

## 含まれる構成 (Included Shape)

- `app/` 配下でサイトコードを編集します
- `app/chatgpt-auth.ts` は、オプションのディスパッチ所有（dispatch-owned）の ChatGPT サインインヘルパーを提供します
- `.openai/hosting.json` は、オプションの Sites D1 および R2 バインディングを宣言します
- `vite.config.ts` は、ローカル開発用に宣言されたバインディングをシミュレートします
- `db/index.ts` は、Cloudflare Worker 環境から D1 バインディングを読み取ります
- `db/schema.ts` は、意図的に空の状態で開始されます
- `examples/d1/` には、オプションの D1 サンプルのインターフェースが含まれています
- `drizzle.config.ts` は、必要に応じてローカルでのマイグレーション生成をサポートします

## ワークスペース認証ヘッダー (Workspace Auth Headers)

OpenAI ワークスペースのサイトは、`oai-authenticated-user-email` から現在のユーザーのメールアドレスを読み取ることができます。

SIWC（Sign in with ChatGPT）で認証されたワークスペースサイトは、ユーザーの SIWC プロファイルに空でない `name` クレームがある場合、`oai-authenticated-user-full-name` も受け取ることがあります。フルネームの値はパーセントエンコードされた UTF-8 であり、`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8` を伴います。

フルネームはオプションとして扱い、存在しない場合はメールアドレスにフォールバックしてください：

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## オプションのディスパッチ所有 ChatGPT サインイン (Optional Dispatch-Owned ChatGPT Sign-In)

サイトでオプションまたは必須の ChatGPT サインインが必要な場合は、`app/chatgpt-auth.ts` からすぐに使えるヘルパーをインポートしてください：

- オプションのサインイン済み UI には `getChatGPTUser()` を使用します。
- 匿名ビジターを「ChatGPT でサインイン」に誘導する必要があるサーバーレンダリングページには、`requireChatGPTUser(returnTo)` を使用します。
- ブラウザのリンクやアクションには、`chatGPTSignInPath(returnTo)` および `chatGPTSignOutPath(returnTo)` を使用します。
- サインインまたはサインアウト後の遷移先として、同一オリジンの相対パス `returnTo` を渡します。ヘルパーがそれを検証し、安全にエンコードします。
- 保護されたページは、リクエストごとのアイデンティティヘッダーに依存するため、`export const dynamic = "force-dynamic"` を指定してください。

ディスパッチ（Dispatch）は、`/signin-with-chatgpt`、`/signout-with-chatgpt`、`/callback`、OAuth クッキー、およびアイデンティティヘッダーの注入を所有しています。これらの予約されたパスに対してアプリのルート（routes）を実装しないでください。ヘルパーをインポートして呼び出さないルートは、匿名のままアクセス可能です。

SIWC はアイデンティティのみを確立し、ワークスペースのメンバーシップを証明するものではありません。ワークスペース全体の制限には Sites ホスティングプラットフォームのアクセス制御ポリシーを使用するか、サーバー側で明示的なメンバーシップまたは許可リスト（allowlist）のチェックを強制してください。

アカウントページ、ユーザー固有のダッシュボード、保存されたレコード、および現在の ChatGPT ユーザーに紐づく書き込みアクションには SIWC を使用してください。公開コンテンツは匿名のままにしてください。

## 診断コマンド (Diagnostic Commands)

- `npm run install:ci`: 制限されたロックファイルインストールを1回実行します
- `npm run dev`: Vite/Vinext 開発サーバーを起動します
- `npm run build`: デプロイ可能な Sites アーティファクトをビルドして検証します
- `npm run start`: ビルドされた Vinext アプリケーションを起動します
- `npm test`: 開発プレビューのレンダリングされたメタデータをビルド、検証、および確認します
- `npm run validate:artifact`: 既存のアーティファクトのマニフェストと ESM `default.fetch` エクスポートを再チェックします
- `npm run db:generate`: スキーマ変更後に Drizzle マイグレーションを生成します

ビルドおよび検証コマンドは、リモートでの失敗後のピンポイントな診断に使用し、通常のチェックポイントパスの一部としては使用しないでください。

タイムアウトのデフォルト値は、`SITES_INSTALL_TIMEOUT`、`SITES_INSTALL_KILL_AFTER`、`SITES_BUILD_TIMEOUT`、および `SITES_BUILD_KILL_AFTER` を使用して、制御されたカナリアテスト用にオーバーライドできます。タイムアウトが発生するとコマンドは失敗します。ヘルパーは、変更されていないインストールやビルドを再試行することはありません。

## 詳細情報 (Learn More)

- [vinext ドキュメント](https://github.com/cloudflare/vinext)
- [Drizzle D1 ガイド](https://orm.drizzle.team/docs/get-started/d1-new)
