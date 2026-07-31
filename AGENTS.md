# ComicDB プロジェクト指示

## 構成

- Next.js App Router、TypeScript、Tailwind CSS、Drizzle ORM、SQLiteを使用する。
- 本番はWindows上のDocker Desktop（WSL2）で単一コンテナとして動かす。
- 構造化データと画像は `DATA_DIR` 配下へ保存し、ブラウザー保存領域を正本にしない。
- 外部公開は既存のOCI Relay Controlを利用し、ComicDB自身へTLS終端やトンネルを追加しない。
- Relay公開時は外部Dockerネットワーク `onprem-relay-ingress`、固定エイリアス
  `comicdb`、コンテナーポート `3000` を使用する。

## セキュリティ

- すべての蔵書・画像・管理APIをサーバー側で認証する。
- Cookie、パスワード、アップロード、Origin検証を弱める変更は行わない。
- 秘密値や実データをリポジトリへ追加しない。

## 検証

- 変更後は `npm test`、`npm run lint`、`npm run build` を実行する。
- DBスキーマ変更ではDrizzleの定義と起動時スキーマを同時に更新する。
- DBマイグレーションは既存DBを変更する前に完全バックアップを作り、失敗時は起動しない。
- Docker関連の変更では `docker compose config` とコンテナのヘルスチェックを確認する。
- Relay公開の変更では、公開FQDNのDNS、正規TLS、Basic認証なしの`401`、
  Basic認証後も未ログインAPIが拒否されることを確認する。
