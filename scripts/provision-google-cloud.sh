#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/provision-google-cloud.sh \
    --project-id PROJECT_ID \
    --origin APP_ORIGIN \
    [--origin ANOTHER_APP_ORIGIN] \
    [--project-name PROJECT_NAME] \
    [--api-key-id API_KEY_ID] \
    [--create-project]

Examples:
  npm run google:provision -- \
    --project-id comicdb-YOUR_UNIQUE_SUFFIX \
    --origin http://localhost:3000

  npm run google:provision -- \
    --project-id comicdb-YOUR_UNIQUE_SUFFIX \
    --project-name ComicDB \
    --origin http://localhost:3000 \
    --create-project
EOF
}

project_id=""
project_name="ComicDB"
api_key_id="comicdb-picker"
create_project=0
origins=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-id)
      [[ $# -ge 2 ]] || {
        echo "--project-idに値が必要です。" >&2
        exit 2
      }
      project_id=$2
      shift 2
      ;;
    --project-name)
      [[ $# -ge 2 ]] || {
        echo "--project-nameに値が必要です。" >&2
        exit 2
      }
      project_name=$2
      shift 2
      ;;
    --origin)
      [[ $# -ge 2 ]] || {
        echo "--originに値が必要です。" >&2
        exit 2
      }
      origins+=("$2")
      shift 2
      ;;
    --api-key-id)
      [[ $# -ge 2 ]] || {
        echo "--api-key-idに値が必要です。" >&2
        exit 2
      }
      api_key_id=$2
      shift 2
      ;;
    --create-project)
      create_project=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "不明な引数です: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "${project_id}" || ${#origins[@]} -eq 0 ]]; then
  usage >&2
  exit 2
fi

if [[ ! "${project_id}" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "PROJECT_IDは6〜30文字の小文字・数字・ハイフンで指定してください。" >&2
  exit 2
fi
if [[ ! "${api_key_id}" =~ ^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
  echo "API_KEY_IDの形式が正しくありません。" >&2
  exit 2
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloudが見つかりません。Google Cloud CLIをインストールしてください。" >&2
  exit 1
fi

active_account=$(gcloud auth list \
  --filter='status:ACTIVE' \
  --format='value(account)' 2>/dev/null | head -n 1)
if [[ -z "${active_account}" ]]; then
  echo "gcloudへログインしていません。先に gcloud auth login を実行してください。" >&2
  exit 1
fi

normalized_origins=()
allowed_referrers=()
for raw_origin in "${origins[@]}"; do
  origin=${raw_origin%/}
  if [[ ! "${origin}" =~ ^https?://[^/[:space:]]+$ ]]; then
    echo "APP_ORIGINはパスを含まないhttp(s) URLで指定してください: ${raw_origin}" >&2
    exit 2
  fi

  scheme=${origin%%://*}
  host_and_port=${origin#*://}
  host=${host_and_port%%:*}
  if [[ "${host}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] \
    && [[ "${host}" != "127.0.0.1" ]]; then
    echo "Google OAuthではlocalhost以外の生IPアドレスを使用できません: ${origin}" >&2
    exit 2
  fi
  if [[ "${scheme}" != "https" ]] \
    && [[ "${host}" != "localhost" ]] \
    && [[ "${host}" != "127.0.0.1" ]]; then
    echo "localhost以外のAPP_ORIGINにはHTTPSが必要です: ${origin}" >&2
    exit 2
  fi

  duplicate=0
  if [[ ${#normalized_origins[@]} -gt 0 ]]; then
    for existing_origin in "${normalized_origins[@]}"; do
      if [[ "${existing_origin}" == "${origin}" ]]; then
        duplicate=1
        break
      fi
    done
  fi
  if [[ ${duplicate} -eq 0 ]]; then
    normalized_origins+=("${origin}")
    allowed_referrers+=("${origin}/*")
  fi
done

if gcloud projects describe "${project_id}" >/dev/null 2>&1; then
  echo "既存プロジェクトを使用します: ${project_id}"
elif [[ ${create_project} -eq 1 ]]; then
  echo "Google Cloudプロジェクトを作成します: ${project_id}"
  gcloud projects create "${project_id}" \
    --name="${project_name}" \
    --format='value(projectId)' \
    --quiet >/dev/null
else
  echo "プロジェクトを確認できません: ${project_id}" >&2
  echo "新規作成する場合は--create-projectを付けて再実行してください。" >&2
  exit 1
fi

echo "Google Workspace APIを有効化します。"
gcloud services enable \
  sheets.googleapis.com \
  drive.googleapis.com \
  picker.googleapis.com \
  apikeys.googleapis.com \
  --project="${project_id}" \
  --quiet

referrer_csv=$(IFS=,; echo "${allowed_referrers[*]}")
if gcloud services api-keys describe "${api_key_id}" \
  --project="${project_id}" >/dev/null 2>&1; then
  echo "既存のPicker API Key制限を更新します: ${api_key_id}"
  if ! gcloud services api-keys update "${api_key_id}" \
    --project="${project_id}" \
    --display-name="ComicDB Picker" \
    --allowed-referrers="${referrer_csv}" \
    --api-target=service=picker.googleapis.com \
    --no-user-output-enabled \
    --quiet >/dev/null 2>&1; then
    echo "Picker API Key制限の更新に失敗しました。" >&2
    exit 1
  fi
else
  echo "Picker API Keyを作成します: ${api_key_id}"
  if ! gcloud services api-keys create \
    --project="${project_id}" \
    --key-id="${api_key_id}" \
    --display-name="ComicDB Picker" \
    --allowed-referrers="${referrer_csv}" \
    --api-target=service=picker.googleapis.com \
    --no-user-output-enabled \
    --quiet >/dev/null 2>&1; then
    echo "Picker API Keyの作成に失敗しました。" >&2
    exit 1
  fi
fi

project_number=$(gcloud projects describe "${project_id}" \
  --format='value(projectNumber)')

echo
echo "Google Cloudの自動設定が完了しました。"
echo "Account: ${active_account}"
echo "Project: ${project_id} (${project_number})"
echo "Picker API Key: ${api_key_id}（キー文字列は表示していません）"
echo "Authorized JavaScript origins（必要な場合）:"
for origin in "${normalized_origins[@]}"; do
  echo "  ${origin}"
done
echo "Authorized redirect URIs:"
for origin in "${normalized_origins[@]}"; do
  echo "  ${origin}/api/google/oauth/callback"
done
echo "Google Auth Platform:"
echo "  https://console.cloud.google.com/auth/overview?project=${project_id}"
