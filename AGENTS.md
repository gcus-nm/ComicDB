# ComicDB プロジェクト指示

## 構成

- Next.js App Router、TypeScript、Tailwind CSS、Drizzle ORM、SQLiteを使用する。
- 本番はWindows上のDocker Desktop（WSL2）で単一コンテナとして動かす。
- 構造化データと画像は `DATA_DIR` 配下へ保存し、ブラウザー保存領域を正本にしない。
- 外部公開やVPN構築は行わず、既存VPN内のリバースプロキシから接続する。

## セキュリティ

- すべての蔵書・画像・管理APIをサーバー側で認証する。
- Cookie、パスワード、アップロード、Origin検証を弱める変更は行わない。
- 秘密値や実データをリポジトリへ追加しない。

## 検証

- 変更後は `npm test`、`npm run lint`、`npm run build` を実行する。
- DBスキーマ変更ではDrizzleの定義と起動時スキーマを同時に更新する。
- DBマイグレーションは既存DBを変更する前に完全バックアップを作り、失敗時は起動しない。
- Docker関連の変更では `docker compose config` とコンテナのヘルスチェックを確認する。
