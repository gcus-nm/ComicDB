# ComicDB

イベントで購入した同人誌を、表紙・サークル・作者・作品・購入履歴と一緒に管理する
1人用のWebサービスです。スマートフォン向けPWAとして利用でき、事前に同期すれば
会場で通信できない場合も所持確認できます。

## 主な機能

- イベントを固定した購入品の連続登録
- イベント別のほしいものリスト、蔵書情報の事前入力、購入チェック、配置・予算管理
- タイトル、サークル、作者、作品、キャラクター、タグの日本語部分一致検索
- 作品ごとにキャラクターとカップリングを管理する階層分類マスター
- 類似タイトルとサークルによる重複候補表示
- 同じ本の追加購入と所持数集計
- 所持中・処分済みの状態管理と、確認付きの誤登録削除
- 表紙撮影、WebP変換、R18表紙の既定ぼかし
- Googleスプレッドシートとの手動双方向同期、CSV入出力
- 読み取り専用オフラインスナップショット
- SQLiteと表紙を含む毎日バックアップ、30世代保持

## WindowsミニPCで起動

### 1. 必要なもの

- Windows 10または11
- Docker Desktop（WSL2バックエンド）
- 既存のOCI Relay、またはSoftEther VPN／WireGuard
- バックアップ用の外付けHDD

Docker DesktopをWindowsログイン時に起動する設定にしてください。

### 2. 設定

`.env.example` を `.env` へコピーし、少なくとも次を環境に合わせて変更します。

```dotenv
APP_ORIGIN=https://comicdb.example.com
COMICDB_BIND_ADDRESS=127.0.0.1
COMICDB_PORT=3000
COMICDB_BACKUP_DIR=D:/ComicDB/backups
TRUSTED_PROXY_CIDRS=
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_PICKER_API_KEY=...
GOOGLE_CLOUD_PROJECT_NUMBER=...
GOOGLE_TOKEN_ENCRYPTION_KEY=...
```

- `APP_ORIGIN`: 外部から利用する正式なHTTPS URL
- `COMICDB_BIND_ADDRESS`: ホスト側の待受アドレス。OCI Relay利用時は `127.0.0.1`
- `COMICDB_BACKUP_DIR`: 外付けHDD上のバックアップフォルダー
- `TRUSTED_PROXY_CIDRS`: 値があると `X-Forwarded-For` をログイン制限に利用。
  OCI Relay構成では空のままにする
- `GOOGLE_TOKEN_ENCRYPTION_KEY`: Refresh Token暗号化用の32バイト鍵。たとえば
  `openssl rand -base64 32` で生成し、バックアップとは別に安全に保管

Google連携を使わない場合、`GOOGLE_` で始まる環境変数は空のままで構いません。
設定画面のGoogle機能だけが無効になり、ComicDB本体とCSVは通常どおり動作します。

自宅ルーター側のポート開放は不要です。

### 3. ビルドと起動

通常の起動ではRelay用外部ネットワークを必要としません。

```powershell
docker compose up -d --build
docker compose ps
```

初回アクセス時は管理者作成画面が表示されます。ユーザー名と12文字以上の
パスワードを設定してください。2人目以降のユーザー作成画面はありません。

## OCI Relayで公開

このリポジトリの本番構成では、次の値を使用します。

| 項目 | 値 |
| --- | --- |
| 公開URL | `https://comicdb.oci.gcusnm.mydns.jp` |
| Docker外部ネットワーク | `onprem-relay-ingress` |
| Relay向け固定エイリアス | `comicdb` |
| コンテナーポート | `8080` |
| Relay側Basic認証ユーザー名 | `comicdb` |

`.env` の `APP_ORIGIN` を公開URLへ設定してコンテナーを再作成した後、OCI Relay
ControlへWeb経路を登録します。Composeのホスト公開は `127.0.0.1` のまま維持し、
Relayからは共有Dockerネットワーク上の `comicdb:8080` へ接続します。
Relay公開時だけ`compose.relay.yaml`を追加指定してください。Relay Controlが管理する
外部ネットワーク`onprem-relay-ingress`が存在しない環境では、この公開用構成は起動しません。
Relay公開中の環境では、以降の`docker compose`操作でも常に
`-f compose.yaml -f compose.relay.yaml`を指定し、共有ネットワーク接続を維持してください。

公開経路にはComicDB自身のログインより手前で専用Basic認証を適用します。パスワードは
Relay Controlが自動生成し、Git管理外の `.env.basic-auth` へ一度だけ保存します。
Relay Control管理画面の認証情報は流用しません。

公開後は少なくとも次を確認します。

```powershell
docker compose -f compose.yaml -f compose.relay.yaml config --quiet
docker compose -f compose.yaml -f compose.relay.yaml up -d --build --force-recreate
docker compose -f compose.yaml -f compose.relay.yaml ps
curl.exe --head https://comicdb.oci.gcusnm.mydns.jp/api/health
```

最後のコマンドは資格情報なしのため `401 Unauthorized` と
`WWW-Authenticate` を返すのが正常です。`.env.basic-auth` の資格情報を付けた場合だけ
ヘルスAPIが `200` になることを確認します。ファイルの値をログ、Issue、コミットへ
貼り付けないでください。

Google連携を使用している場合は、Picker API KeyのReferrerへ公開Originを追加し、
OAuth Clientの承認済みリダイレクトURIへ次を追加してから接続し直してください。

```text
https://comicdb.oci.gcusnm.mydns.jp/api/google/oauth/callback
```

詳しくは[Googleスプレッドシート連携セットアップ](docs/google-sheets-setup.md)の
「本番HTTPS URLへ切り替える」を参照してください。

## VPN経由のHTTPSリバースプロキシ

VPSとWindowsミニPCの間は既存VPN経由で接続してください。ComicDBはVPNや証明書を
構築しません。

### Nginx例

```nginx
server {
    listen 443 ssl http2;
    server_name comicdb.example.com;

    # ssl_certificate と ssl_certificate_key は既存の証明書を指定

    location / {
        proxy_pass http://10.20.0.10:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        client_max_body_size 22m;
    }
}
```

### Caddy例

```caddyfile
comicdb.example.com {
    reverse_proxy 10.20.0.10:3000
    request_body {
        max_size 22MB
    }
}
```

VPSのHTTPS待受も可能ならVPN側インターフェースに限定してください。インターネットへ
公開する場合は、VPS側のファイアウォールやアクセス制限を別途設計してください。

## オフライン利用

Service WorkerはHTTPSまたはlocalhostでのみ動作します。

1. スマートフォンでHTTPS URLへログイン
2. 「設定」→「オフライン所持確認」→「端末へ保存」
3. 必要ならブラウザーの「ホーム画面に追加」を実行

オフラインでは検索と閲覧だけ利用できます。追加・編集はできません。端末へ保存した
データは暗号化用PINを持たないため、スマートフォン自体のロックを有効にしてください。

## Googleスプレッドシート

ComicDBを正本として、設定画面の「シートへ反映」「シートから取込」を手動で実行します。
新規スプレッドシートの作成と、Google Pickerで選んだ既存スプレッドシートへの接続に
対応します。ComicDB形式の20列が一致するタブだけを管理対象にし、他のタブは変更しません。

既存行の購入情報は参照専用です。新規行では初回購入情報として使用できます。シートから
消した行はComicDBから削除されません。ComicDB側とシート側が同時に変わった行は競合として
保留し、エラー行と競合行を除いた新規・更新だけを取り込みます。表紙と全購入履歴は同期
対象外です。1回につき最大5,000行まで取り込めます。

### Google Cloud設定

詳しい初回構築、OAuth Client作成、Production化、本番URL移行、トラブル対応は
[Googleスプレッドシート連携セットアップ](docs/google-sheets-setup.md)を参照してください。

Google Cloudプロジェクト、必要API、制限付きPicker API Keyは`gcloud`で構築できます。

```bash
gcloud auth login

npm run google:provision -- \
  --project-id comicdb-YOUR_UNIQUE_SUFFIX \
  --project-name ComicDB \
  --origin http://localhost:3000 \
  --create-project
```

Google Auth PlatformでExternal OAuth同意画面とWeb application OAuth Clientを作り、
`${APP_ORIGIN}/api/google/oauth/callback`を承認済みリダイレクトURIへ登録します。
OAuth Client JSONをダウンロードしたら、次のCLIで`.env`へ取り込みます。

```bash
npm run google:configure -- ~/Downloads/client_secret_....json
```

構築CLIはAPI Keyの文字列を表示しません。設定CLIはCallback URIを検証し、暗号化鍵を
初回だけ生成して、秘密値を標準出力へ表示せず`.env`へ保存します。設定後にコンテナを
再作成してください。

権限は [`drive.file`](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
のみで、ComicDBが作成したファイルと
[Google Picker](https://developers.google.com/workspace/drive/picker/guides/web-picker)で
利用者が選択したファイルだけへアクセスします。OAuthアプリがTestingのままだと
Externalアプリの認可とRefresh Tokenが
[7日で失効](https://support.google.com/cloud/answer/15549945)するため、継続運用には
使用しません。Refresh TokenだけをAES-256-GCM暗号文としてSQLiteへ保存し、
Access Tokenは永続化しません。

## CLIと自動化API

蔵書・イベントの主要な読取、登録、更新、蔵書削除、操作監査は、Web UIと同じ
Application Serviceを使う非対話CLIから実行できます。機械可読なAPI契約は
[docs/automation-api.yaml](docs/automation-api.yaml)を参照してください。表紙画像の
追加・差し替えは、ファイル検査とプレビューが必要なため引き続きWeb UIで行います。

`.env`へ読取用と変更用で異なるランダムトークンを設定し、コンテナを再作成します。
どちらも32文字以上が必要です。読取だけを行うAIには変更用トークンを渡さないでください。

```dotenv
COMICDB_API_READ_TOKEN=読取専用のランダム値
COMICDB_API_WRITE_TOKEN=変更専用の別ランダム値
```

```bash
openssl rand -base64 48
openssl rand -base64 48
docker compose up -d --build --force-recreate
```

CLIをコンテナ内で実行すると、トークンをコマンド引数やURLへ含めず環境から取得できます。

```bash
docker compose exec comicdb npm run cli -- books list --limit 20 --json
docker compose exec comicdb npm run cli -- events list --json
docker compose exec comicdb npm run cli -- audit --limit 50 --json
```

登録・更新データはJSONファイルまたは標準入力から渡します。`--dry-run`はバックエンドで
認証・入力検証・業務ルールを実行し、変更対象を返しますがSQLiteを変更しません。

```json
{
  "title": "CLI登録例",
  "circles": ["サークル名"],
  "adultRating": "general",
  "quantity": 1
}
```

```bash
docker compose exec -T comicdb npm run cli -- books create --input - --dry-run --json < book.json
```

実変更では接続先Originと冪等性キーが必須です。同じキー・同じ要求を24時間以内に
再試行すると、重複登録せず前回の成功結果を返します。異なる要求へ同じキーを使うと
`409 Conflict`になります。

```bash
docker compose exec -T comicdb npm run cli -- books create --input - --confirm http://127.0.0.1:3000 --idempotency-key book-register-20260803-01 --json < book.json
```

蔵書の完全削除では、Originに加えて`--confirm-delete <蔵書ID>`も一致させる必要があります。
成功データは標準出力、失敗対象・理由・再試行可否を持つJSONエラーは標準エラーへ分離されます。
終了コードと全コマンド例は`docker compose exec comicdb npm run cli -- --help`で確認できます。

## CSV

「設定」から日本語見出しのCSVテンプレートと全件データを取得できます。取込時は
行別エラーと重複候補を確認してから確定します。所持状態も往復できます。複数項目の
区切り文字には `、`、`,`、`;` を使用できます。

HEIC画像の直接取込には対応していません。カメラ撮影、JPEG、PNG、WebP、AVIFを
使用してください。

## バックアップと復元

`AUTO_BACKUP=true` の場合、アプリ起動後に1日1回バックアップを確認します。
バックアップは `COMICDB_BACKUP_DIR` にZIPで保存され、30世代を超えた古いものを
削除します。管理画面から即時実行もできます。

起動時にDBスキーマ更新が必要な場合は、更新前バックアップを自動作成してから
マイグレーションします。バックアップまたはマイグレーションに失敗した場合、
Webサーバーは起動しません。

復元前にアプリを停止します。次のコマンドは現在データを
`/data/pre-restore-...` へ退避してから復元するため、直前状態へ戻せます。

```powershell
docker compose down
docker compose run --rm --no-deps comicdb npm run restore -- --from /backups/comicdb-YYYY-MM-DD....zip --confirm
docker compose up -d
```

復元後はログイン、蔵書件数、表紙表示を確認してください。

## 更新

更新前に管理画面から手動バックアップを作成します。

```powershell
docker compose build --pull
docker compose up -d
docker compose ps
```

Relay公開中の環境では、共有ネットワーク接続を維持するため公開用構成も指定します。

```powershell
docker compose -f compose.yaml -f compose.relay.yaml build --pull
docker compose -f compose.yaml -f compose.relay.yaml up -d
docker compose -f compose.yaml -f compose.relay.yaml ps
```

## 開発

Node.js 22以降とnpmを使用します。

```bash
npm ci
cp .env.example .env
npm run dev
```

検証コマンド:

```bash
npm test
npm run lint
npm run build
docker compose config
docker compose -f compose.yaml -f compose.relay.yaml config
```

ローカルデータは `data/`、バックアップは `backups/` に作成され、Git管理対象外です。
