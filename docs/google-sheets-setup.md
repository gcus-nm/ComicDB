# Googleスプレッドシート連携セットアップ

ComicDBから個人Googleアカウントのスプレッドシートへ接続するための初回設定です。
Google Cloudプロジェクト、必要API、制限付きPicker API Keyは`gcloud`で構築します。
Google Auth PlatformのOAuth同意画面とWeb application OAuth Clientだけは、Google Cloud
Consoleで作成します。

## 構成

- ComicDBは`drive.file`だけを要求します。
- ComicDBが作成したファイルと、Google Pickerで利用者が選択したファイルだけを扱います。
- Refresh TokenだけをAES-256-GCMで暗号化してSQLiteへ保存します。
- Access Tokenは永続化しません。
- OAuth Client Secret、Picker API Key、暗号化鍵はGitへ追加しません。

## 1. Google Cloud CLIへログイン

[Google Cloud CLI](https://cloud.google.com/sdk/docs/install)をインストールし、ComicDB用
プロジェクトを所有する個人Googleアカウントでログインします。

```bash
gcloud auth login
gcloud auth list
```

## 2. Google Cloudリソースを構築

プロジェクトIDはGoogle Cloud全体で一意かつ、作成後に変更できません。任意の一意な
サフィックスへ置き換えてください。

新規プロジェクトを作る場合:

```bash
npm run google:provision -- \
  --project-id comicdb-YOUR_UNIQUE_SUFFIX \
  --project-name ComicDB \
  --origin http://localhost:3000 \
  --create-project
```

既存プロジェクトを更新する場合:

```bash
npm run google:provision -- \
  --project-id comicdb-YOUR_UNIQUE_SUFFIX \
  --origin http://localhost:3000
```

このCLIは次を冪等に設定します。

- Google Sheets API
- Google Drive API
- Google Picker API
- API Keys API
- `picker.googleapis.com`だけを許可したPicker API Key
- 指定した`APP_ORIGIN`だけを許可したHTTP Referrer制限

API Keyの文字列は標準出力へ表示しません。既存API Keyがある場合は、指定した
`--origin`の一覧で制限を更新します。複数環境を許可する場合は`--origin`を繰り返します。

```bash
npm run google:provision -- \
  --project-id comicdb-YOUR_UNIQUE_SUFFIX \
  --origin http://localhost:3000 \
  --origin https://comicdb.example.com
```

`localhost`以外の生IPアドレスはGoogle OAuthのWeb application Clientに使用できません。
本番環境は、所有または利用許諾されたドメインをHTTPSで使用してください。

## 3. Google Auth Platformを設定

CLIが最後に表示するGoogle Auth Platform URLを開き、対象プロジェクトを確認します。

### Branding

- App name: `ComicDB`
- User support email: 自分のGoogleアカウント
- Developer contact information: 自分の連絡先

個人利用では、ロゴ、ホームページ、プライバシーポリシーは検証申請をしない範囲で
必須にならない場合があります。Google Cloud Consoleに必須項目として表示された場合は、
画面の案内に従って設定してください。

### Audience

- User type: `External`
- 初回確認中: `Testing`
- Test users: ComicDBとの接続に使うGoogleアカウント

`Testing`中は、Test usersへ追加されていないアカウントで認可すると
`403: access_denied`になります。また、Externalアプリの認可とRefresh Tokenは7日で
失効します。動作確認後は`In production`へ変更してください。

### Data Access

ComicDBが要求するスコープは次の1つだけです。

```text
https://www.googleapis.com/auth/drive.file
```

## 4. OAuth Client IDを作成

Google Auth Platformの「Clients」で「Create Client」を選択します。

- Application type: `Web application`
- Name: `ComicDB`
- Authorized redirect URI:

  ```text
  http://localhost:3000/api/google/oauth/callback
  ```

今回の実装はサーバー側OAuthフローなので、Authorized JavaScript originsは必須では
ありません。登録する場合はパスを含めず、次のように指定します。

```text
http://localhost:3000
```

スキーム、ホスト、ポート、パスはComicDBの`APP_ORIGIN`と完全一致させてください。
作成後、OAuth Client JSONをダウンロードします。JSONの内容やClient Secretをチャット、
Issue、コミットへ貼り付けないでください。

## 5. OAuth Client JSONをComicDBへ取り込む

ダウンロードしたJSONを指定してセットアップCLIを実行します。

```bash
npm run google:configure -- \
  ~/Downloads/client_secret_....json
```

CLIは次を実行します。

- Web application用JSONであることを検証
- JSONのGoogle Cloudプロジェクトを検証
- OAuth ClientにCallback URIが登録済みであることを検証
- `gcloud`からProject NumberとPicker API Keyを取得
- Refresh Token用32バイト暗号化鍵を初回だけ生成
- 既存暗号化鍵を再実行時も保持
- `.env`を権限`600`で保存

秘密値は標準出力へ表示しません。`.env`と`client_secret_*.json`はGitおよびDocker
ビルドコンテキストから除外されています。取込完了後、元のOAuth Client JSONは
リポジトリ外へ移動するか削除してください。

## 6. Dockerへ反映

```bash
docker compose config --quiet
docker compose build
docker compose up -d --force-recreate
docker compose ps
```

コンテナが`healthy`になったら
[`http://localhost:3000/settings`](http://localhost:3000/settings)を開き、
「Googleに接続」を実行します。

## 7. 本番HTTPS URLへ切り替える

例として本番URLを`https://comicdb.example.com`とします。

1. Picker API Keyへ本番Referrerを追加します。

   ```bash
   npm run google:provision -- \
     --project-id comicdb-YOUR_UNIQUE_SUFFIX \
     --origin http://localhost:3000 \
     --origin https://comicdb.example.com
   ```

2. OAuth Clientへ次のCallback URIを追加します。

   ```text
   https://comicdb.example.com/api/google/oauth/callback
   ```

3. 更新後のOAuth Client JSONを再ダウンロードします。
4. 本番URLを指定して`.env`を更新します。

   ```bash
   npm run google:configure -- \
     ~/Downloads/client_secret_....json \
     https://comicdb.example.com
   ```

5. Dockerコンテナを再作成します。

同一OAuth Clientへlocalhostと本番URLの両方を登録できます。VPN内運用でも生IPではなく、
HTTPSリバースプロキシのドメインを使用してください。

## トラブルシューティング

### `403: access_denied`

OAuthアプリが`Testing`で、ログインしたGoogleアカウントがTest usersにありません。
Audience設定で対象アカウントを追加するか、動作確認後に`In production`へ変更します。
変更後は数分待ち、エラー画面を再読み込みせず、ComicDBの設定画面から接続をやり直します。

### `redirect_uri_mismatch`

OAuth Clientへ登録したCallback URIと、ComicDBの
`${APP_ORIGIN}/api/google/oauth/callback`が一致していません。`http`／`https`、ポート、
末尾スラッシュまで確認し、OAuth Client JSONを再ダウンロードして設定CLIを再実行します。

### Pickerが開かない、API Keyエラーになる

Picker API KeyのHTTP Referrerと現在の`APP_ORIGIN`を確認し、構築CLIへ利用中のURLをすべて
`--origin`で指定し直します。

### `invalid_grant`

Google側でRefresh Tokenが失効しています。ComicDBのGoogle接続を解除し、改めて接続します。
OAuthアプリが`Testing`の場合は`In production`への変更も確認してください。

### Google機能が無効表示になる

`.env`のGoogle設定5項目が不足しているか、暗号化鍵が32バイトではありません。
`google:configure`を再実行してDockerコンテナを再作成してください。

## 自動化できない範囲

`gcloud iam oauth-clients`とTerraformの`google_iam_oauth_client`は、Google Workspaceの
`drive.file`を使う一般的なWeb application OAuth Clientとは用途が異なります。そのため、
Google Auth Platformの同意画面、Audience、Data Access、Web application Clientの作成は
Cloud Consoleで行います。
