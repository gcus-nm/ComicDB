#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/configure-google.sh CLIENT_JSON [APP_ORIGIN] [PROJECT_ID] [API_KEY_ID]

Examples:
  npm run google:configure -- ~/Downloads/client_secret_....json
  npm run google:configure -- ~/Downloads/client_secret_....json https://comicdb.example.com
EOF
}

if [[ $# -lt 1 || $# -gt 4 ]]; then
  usage >&2
  exit 2
fi

for required_command in jq gcloud openssl; do
  if ! command -v "${required_command}" >/dev/null 2>&1; then
    echo "${required_command} が見つかりません。" >&2
    exit 1
  fi
done

credentials_path=$1
if [[ ! -f "${credentials_path}" ]]; then
  echo "OAuth Client JSONが見つかりません: ${credentials_path}" >&2
  exit 1
fi

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "${script_dir}/.." && pwd)
env_file="${repo_root}/.env"
env_example="${repo_root}/.env.example"

if ! jq -e '.web and (.web.client_id | type == "string") and (.web.client_secret | type == "string")' \
  "${credentials_path}" >/dev/null; then
  echo "Web application用のOAuth Client JSONではありません。" >&2
  exit 1
fi

json_project_id=$(jq -r '.web.project_id' "${credentials_path}")
project_id=${3:-"${json_project_id}"}
if [[ "${project_id}" != "${json_project_id}" ]]; then
  echo "JSONのproject_idと指定されたPROJECT_IDが一致しません。" >&2
  exit 1
fi

configured_origin=""
if [[ -f "${env_file}" ]]; then
  configured_origin=$(sed -n 's/^APP_ORIGIN=//p' "${env_file}" | tail -n 1)
fi
app_origin=${2:-${configured_origin:-http://localhost:3000}}
app_origin=${app_origin%/}
if [[ ! "${app_origin}" =~ ^https?://[^[:space:]]+$ ]]; then
  echo "APP_ORIGINはhttp://またはhttps://で始まるURLを指定してください。" >&2
  exit 1
fi

redirect_uri="${app_origin}/api/google/oauth/callback"
if ! jq -e --arg redirect_uri "${redirect_uri}" \
  '.web.redirect_uris | index($redirect_uri) != null' \
  "${credentials_path}" >/dev/null; then
  echo "OAuth Clientに次のリダイレクトURIが登録されていません:" >&2
  echo "  ${redirect_uri}" >&2
  exit 1
fi

api_key_id=${4:-comicdb-picker}
project_number=$(gcloud projects describe "${project_id}" \
  --format='value(projectNumber)')
picker_api_key=$(gcloud services api-keys get-key-string "${api_key_id}" \
  --project="${project_id}" \
  --format='value(keyString)')

if [[ -z "${project_number}" || -z "${picker_api_key}" ]]; then
  echo "Project NumberまたはPicker API Keyを取得できませんでした。" >&2
  exit 1
fi

client_id=$(jq -r '.web.client_id' "${credentials_path}")
client_secret=$(jq -r '.web.client_secret' "${credentials_path}")

encryption_key=""
if [[ -f "${env_file}" ]]; then
  encryption_key=$(sed -n 's/^GOOGLE_TOKEN_ENCRYPTION_KEY=//p' "${env_file}" | tail -n 1)
fi
if [[ -z "${encryption_key}" ]]; then
  encryption_key=$(openssl rand -hex 32)
fi

source_env=${env_file}
if [[ ! -f "${source_env}" ]]; then
  source_env=${env_example}
fi
if [[ ! -f "${source_env}" ]]; then
  echo ".env.exampleが見つかりません。" >&2
  exit 1
fi

umask 077
temp_env=$(mktemp "${repo_root}/.env.tmp.XXXXXX")
cleanup() {
  rm -f "${temp_env}"
}
trap cleanup EXIT

seen_origin=0
seen_client_id=0
seen_client_secret=0
seen_picker_key=0
seen_project_number=0
seen_encryption_key=0

while IFS= read -r line || [[ -n "${line}" ]]; do
  case "${line}" in
    APP_ORIGIN=*)
      printf 'APP_ORIGIN=%s\n' "${app_origin}" >>"${temp_env}"
      seen_origin=1
      ;;
    GOOGLE_CLIENT_ID=*)
      printf 'GOOGLE_CLIENT_ID=%s\n' "${client_id}" >>"${temp_env}"
      seen_client_id=1
      ;;
    GOOGLE_CLIENT_SECRET=*)
      printf 'GOOGLE_CLIENT_SECRET=%s\n' "${client_secret}" >>"${temp_env}"
      seen_client_secret=1
      ;;
    GOOGLE_PICKER_API_KEY=*)
      printf 'GOOGLE_PICKER_API_KEY=%s\n' "${picker_api_key}" >>"${temp_env}"
      seen_picker_key=1
      ;;
    GOOGLE_CLOUD_PROJECT_NUMBER=*)
      printf 'GOOGLE_CLOUD_PROJECT_NUMBER=%s\n' "${project_number}" >>"${temp_env}"
      seen_project_number=1
      ;;
    GOOGLE_TOKEN_ENCRYPTION_KEY=*)
      printf 'GOOGLE_TOKEN_ENCRYPTION_KEY=%s\n' "${encryption_key}" >>"${temp_env}"
      seen_encryption_key=1
      ;;
    *)
      printf '%s\n' "${line}" >>"${temp_env}"
      ;;
  esac
done <"${source_env}"

if [[ ${seen_origin} -eq 0 ]]; then
  printf 'APP_ORIGIN=%s\n' "${app_origin}" >>"${temp_env}"
fi
if [[ ${seen_client_id} -eq 0 ]]; then
  printf 'GOOGLE_CLIENT_ID=%s\n' "${client_id}" >>"${temp_env}"
fi
if [[ ${seen_client_secret} -eq 0 ]]; then
  printf 'GOOGLE_CLIENT_SECRET=%s\n' "${client_secret}" >>"${temp_env}"
fi
if [[ ${seen_picker_key} -eq 0 ]]; then
  printf 'GOOGLE_PICKER_API_KEY=%s\n' "${picker_api_key}" >>"${temp_env}"
fi
if [[ ${seen_project_number} -eq 0 ]]; then
  printf 'GOOGLE_CLOUD_PROJECT_NUMBER=%s\n' "${project_number}" >>"${temp_env}"
fi
if [[ ${seen_encryption_key} -eq 0 ]]; then
  printf 'GOOGLE_TOKEN_ENCRYPTION_KEY=%s\n' "${encryption_key}" >>"${temp_env}"
fi

chmod 600 "${temp_env}"
mv "${temp_env}" "${env_file}"
trap - EXIT

echo "Google連携設定を.envへ保存しました。"
echo "Project: ${project_id} (${project_number})"
echo "Origin: ${app_origin}"
echo "OAuth Client JSONと秘密値は表示していません。"
