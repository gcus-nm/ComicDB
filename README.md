# ComicDB

イベントで購入した同人誌を、表紙・サークル・作者・作品・購入履歴と一緒に管理する
1人用のWebサービスです。スマートフォン向けPWAとして利用でき、事前に同期すれば
会場で通信できない場合も所持確認できます。

## 主な機能

- イベントを固定した購入品の連続登録
- イベント別のほしいものリスト、購入チェック、配置・予算管理
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
- 既存のSoftEther VPNまたはWireGuard
- バックアップ用の外付けHDD

Docker DesktopをWindowsログイン時に起動する設定にしてください。

### 2. 設定

`.env.example` を `.env` へコピーし、少なくとも次を環境に合わせて変更します。

```dotenv
APP_ORIGIN=https://comicdb.example.com
COMICDB_BIND_ADDRESS=10.20.0.10
COMICDB_PORT=3000
COMICDB_BACKUP_DIR=D:/ComicDB/backups
TRUSTED_PROXY_CIDRS=10.20.0.1/32
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_PICKER_API_KEY=...
GOOGLE_CLOUD_PROJECT_NUMBER=...
GOOGLE_TOKEN_ENCRYPTION_KEY=...
```

- `APP_ORIGIN`: VPS側リバースプロキシで利用する正式なHTTPS URL
- `COMICDB_BIND_ADDRESS`: WindowsミニPCのVPN側IP。ローカルだけなら `127.0.0.1`
- `COMICDB_BACKUP_DIR`: 外付けHDD上のバックアップフォルダー
- `TRUSTED_PROXY_CIDRS`: VPSのVPN側アドレス。値があると転送元IPをログイン制限に利用
- `GOOGLE_TOKEN_ENCRYPTION_KEY`: Refresh Token暗号化用の32バイト鍵。たとえば
  `openssl rand -base64 32` で生成し、バックアップとは別に安全に保管

Google連携を使わない場合、`GOOGLE_` で始まる環境変数は空のままで構いません。
設定画面のGoogle機能だけが無効になり、ComicDB本体とCSVは通常どおり動作します。

自宅ルーター側のポート開放は不要です。

### 3. ビルドと起動

```powershell
docker compose up -d --build
docker compose ps
```

初回アクセス時は管理者作成画面が表示されます。ユーザー名と12文字以上の
パスワードを設定してください。2人目以降のユーザー作成画面はありません。

## VPS側HTTPSリバースプロキシ

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
```

ローカルデータは `data/`、バックアップは `backups/` に作成され、Git管理対象外です。
