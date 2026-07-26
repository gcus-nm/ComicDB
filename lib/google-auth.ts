import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { google } from "googleapis";
import { getDb } from "@/db";
import { appOrigin, googleEnvironment, googleEnvironmentStatus } from "./env";
import { HttpError } from "./security";

const OAUTH_TTL_MS = 10 * 60 * 1000;
const TOKEN_AAD = Buffer.from("ComicDB/google-refresh-token/v1", "utf8");
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
] as const;

export type GoogleIntegrationRow = {
  user_id: string;
  google_subject: string;
  google_email: string;
  encrypted_refresh_token: string;
  granted_scopes: string;
  spreadsheet_id: string | null;
  spreadsheet_name: string | null;
  sheet_id: number | null;
  sheet_title: string | null;
  last_push_at: string | null;
  last_pull_at: string | null;
  created_at: string;
  updated_at: string;
};

function stateHash(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

function encryptionKey(encoded: string) {
  const value = encoded.trim();
  const key = /^[0-9a-f]{64}$/iu.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64url");
  if (key.length !== 32) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY は32バイト（base64urlまたは64桁hex）で指定してください。",
    );
  }
  return key;
}

export function encryptGoogleRefreshToken(
  refreshToken: string,
  encodedKey = googleEnvironment().encryptionKey,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(encodedKey), iv);
  cipher.setAAD(TOKEN_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(refreshToken, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptGoogleRefreshToken(
  encrypted: string,
  encodedKey = googleEnvironment().encryptionKey,
) {
  const [version, ivValue, tagValue, ciphertextValue, extra] =
    encrypted.split(".");
  if (
    version !== "v1" ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue ||
    extra
  ) {
    throw new Error("Googleトークンの暗号文形式が不正です。");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(encodedKey),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAAD(TOKEN_AAD);
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function oauthClient() {
  const environment = googleEnvironment();
  return new google.auth.OAuth2(
    environment.clientId,
    environment.clientSecret,
    new URL("/api/google/oauth/callback", appOrigin()).toString(),
  );
}

export function getGoogleIntegration(userId: string) {
  return getDb().sqlite
    .prepare("SELECT * FROM google_integrations WHERE user_id = ?")
    .get(userId) as GoogleIntegrationRow | undefined;
}

export function googlePublicConfiguration() {
  const status = googleEnvironmentStatus();
  if (!status.configured) return { ...status, pickerApiKey: null, projectNumber: null };
  const environment = googleEnvironment();
  return {
    configured: true,
    missing: [] as string[],
    pickerApiKey: environment.pickerApiKey,
    projectNumber: environment.projectNumber,
  };
}

export function beginGoogleOAuth(userId: string, sessionId: string) {
  if (!googleEnvironmentStatus().configured) {
    throw new HttpError(503, "Google連携は環境設定が不足しているため利用できません。");
  }
  const state = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OAUTH_TTL_MS).toISOString();
  const db = getDb().sqlite;
  db.prepare("DELETE FROM google_oauth_states WHERE expires_at <= ?").run(
    now.toISOString(),
  );
  db.prepare(
    `INSERT INTO google_oauth_states
       (state_hash, user_id, session_id, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(stateHash(state), userId, sessionId, expiresAt, now.toISOString());
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [...GOOGLE_SCOPES],
    state,
  });
}

export function consumeGoogleOAuthState(
  state: string,
  userId: string,
  sessionId: string,
) {
  if (!state) throw new HttpError(400, "OAuth stateがありません。");
  const db = getDb().sqlite;
  const row = db
    .prepare(
      `SELECT user_id, session_id, expires_at
       FROM google_oauth_states WHERE state_hash = ?`,
    )
    .get(stateHash(state)) as
    | { user_id: string; session_id: string; expires_at: string }
    | undefined;
  if (!row) {
    throw new HttpError(400, "OAuth stateが無効か、既に使用されています。");
  }
  if (row.user_id !== userId || row.session_id !== sessionId) {
    throw new HttpError(403, "OAuthを開始したComicDBセッションと一致しません。");
  }
  db.prepare("DELETE FROM google_oauth_states WHERE state_hash = ?").run(
    stateHash(state),
  );
  if (Date.parse(row.expires_at) <= Date.now()) {
    throw new HttpError(400, "OAuth stateの有効期限が切れています。");
  }
}

function googleAuthError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/invalid_grant/iu.test(message)) {
    throw new HttpError(
      401,
      "Googleの認可が失効しています。接続し直してください。",
    );
  }
  throw error;
}

export async function completeGoogleOAuth(
  code: string,
  state: string,
  userId: string,
  sessionId: string,
) {
  consumeGoogleOAuthState(state, userId, sessionId);
  if (!code) throw new HttpError(400, "Googleから認可コードが返されませんでした。");
  try {
    const client = oauthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      throw new HttpError(
        400,
        "Refresh Tokenを取得できませんでした。Google接続をやり直してください。",
      );
    }
    const refreshToken = tokens.refresh_token;
    const grantedScopeText = tokens.scope?.trim() || GOOGLE_SCOPES.join(" ");
    const grantedScopes = new Set(grantedScopeText.split(/\s+/u));
    if (!grantedScopes.has(GOOGLE_SCOPES[0])) {
      throw new HttpError(
        403,
        "Google Driveの必要な権限が許可されませんでした。接続をやり直してください。",
      );
    }
    client.setCredentials(tokens);
    const identity = await google
      .drive({ version: "v3", auth: client })
      .about.get({ fields: "user" });
    const googleUser = identity.data.user;
    if (
      !googleUser?.permissionId ||
      !googleUser.emailAddress
    ) {
      throw new HttpError(400, "Googleアカウント情報を取得できませんでした。");
    }
    const googleSubject = googleUser.permissionId;
    const googleEmail = googleUser.emailAddress;
    const now = new Date().toISOString();
    const previous = getGoogleIntegration(userId);
    getDb().sqlite.transaction(() => {
      getDb().sqlite
        .prepare(
          `INSERT INTO google_integrations
           (user_id, google_subject, google_email, encrypted_refresh_token,
            granted_scopes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           spreadsheet_id = CASE
             WHEN google_integrations.google_subject = excluded.google_subject
             THEN google_integrations.spreadsheet_id ELSE NULL END,
           spreadsheet_name = CASE
             WHEN google_integrations.google_subject = excluded.google_subject
             THEN google_integrations.spreadsheet_name ELSE NULL END,
           sheet_id = CASE
             WHEN google_integrations.google_subject = excluded.google_subject
             THEN google_integrations.sheet_id ELSE NULL END,
           sheet_title = CASE
             WHEN google_integrations.google_subject = excluded.google_subject
             THEN google_integrations.sheet_title ELSE NULL END,
           last_push_at = CASE
             WHEN google_integrations.google_subject = excluded.google_subject
             THEN google_integrations.last_push_at ELSE NULL END,
           last_pull_at = CASE
             WHEN google_integrations.google_subject = excluded.google_subject
             THEN google_integrations.last_pull_at ELSE NULL END,
           google_subject = excluded.google_subject,
           google_email = excluded.google_email,
           encrypted_refresh_token = excluded.encrypted_refresh_token,
           granted_scopes = excluded.granted_scopes,
           updated_at = excluded.updated_at`,
        )
        .run(
          userId,
          googleSubject,
          googleEmail,
          encryptGoogleRefreshToken(refreshToken),
          grantedScopeText,
          now,
          now,
        );
      if (
        previous &&
        previous.google_subject !== googleSubject
      ) {
        getDb().sqlite
          .prepare("DELETE FROM app_settings WHERE key = ?")
          .run(`google_pull_pending:${userId}`);
      }
    })();
    return getGoogleIntegration(userId)!;
  } catch (error) {
    googleAuthError(error);
  }
}

export function authorizedGoogleClient(userId: string) {
  const integration = getGoogleIntegration(userId);
  if (!integration) {
    throw new HttpError(409, "Googleアカウントが接続されていません。");
  }
  const client = oauthClient();
  client.setCredentials({
    refresh_token: decryptGoogleRefreshToken(
      integration.encrypted_refresh_token,
    ),
  });
  return { client, integration };
}

export async function pickerAccessToken(userId: string) {
  try {
    const { client } = authorizedGoogleClient(userId);
    const result = await client.getAccessToken();
    if (!result.token) throw new Error("Access Tokenを取得できませんでした。");
    return result.token;
  } catch (error) {
    googleAuthError(error);
  }
}

export async function disconnectGoogle(userId: string) {
  const integration = getGoogleIntegration(userId);
  try {
    if (integration) {
      const client = oauthClient();
      await client.revokeToken(
        decryptGoogleRefreshToken(integration.encrypted_refresh_token),
      );
    }
  } catch {
    console.warn("Googleトークンの失効要求に失敗しました。");
  } finally {
    getDb().sqlite.transaction(() => {
      getDb().sqlite
        .prepare("DELETE FROM google_oauth_states WHERE user_id = ?")
        .run(userId);
      getDb().sqlite
        .prepare("DELETE FROM app_settings WHERE key = ?")
        .run(`google_pull_pending:${userId}`);
      getDb().sqlite
        .prepare("DELETE FROM google_integrations WHERE user_id = ?")
        .run(userId);
    })();
  }
}
