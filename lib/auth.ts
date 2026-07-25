import { createHash, randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { normalizeText } from "./normalize";
import { secureCookies } from "./env";
import { HttpError, clientAddress } from "./security";

export const SESSION_COOKIE = "comicdb_session";
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
};

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

export function userExists() {
  const row = getDb().sqlite
    .prepare("SELECT COUNT(*) AS count FROM users")
    .get() as { count: number };
  return row.count > 0;
}

export async function createAdmin(username: string, password: string) {
  if (userExists()) throw new HttpError(409, "管理者は既に作成されています。");
  const normalizedUsername = normalizeText(username);
  if (normalizedUsername.length < 3 || normalizedUsername.length > 64) {
    throw new HttpError(400, "ユーザー名は3〜64文字で入力してください。");
  }
  if (password.length < 12 || password.length > 128) {
    throw new HttpError(400, "パスワードは12〜128文字で入力してください。");
  }
  const now = nowIso();
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 3,
    parallelism: 1,
  });
  getDb()
    .sqlite.prepare(
      "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(randomUUID(), normalizedUsername, passwordHash, now, now);
  return startSession(normalizedUsername);
}

function attemptKey(username: string, request: Request) {
  return createHash("sha256")
    .update(`${normalizeText(username)}|${clientAddress(request)}`)
    .digest("hex");
}

function assertNotBlocked(key: string) {
  const row = getDb().sqlite
    .prepare("SELECT attempts, first_attempt_at, blocked_until FROM login_attempts WHERE key = ?")
    .get(key) as
    | { attempts: number; first_attempt_at: string; blocked_until: string | null }
    | undefined;
  if (row?.blocked_until && Date.parse(row.blocked_until) > Date.now()) {
    throw new HttpError(429, "ログイン試行が多すぎます。しばらく待ってください。");
  }
}

function recordFailure(key: string) {
  const db = getDb().sqlite;
  const existing = db
    .prepare("SELECT attempts, first_attempt_at FROM login_attempts WHERE key = ?")
    .get(key) as { attempts: number; first_attempt_at: string } | undefined;
  const now = Date.now();
  const inWindow =
    existing && now - Date.parse(existing.first_attempt_at) < ATTEMPT_WINDOW_MS;
  const attempts = inWindow ? existing.attempts + 1 : 1;
  const firstAttemptAt = inWindow ? existing.first_attempt_at : new Date(now).toISOString();
  const blockedUntil =
    attempts >= MAX_ATTEMPTS ? new Date(now + BLOCK_MS).toISOString() : null;
  db.prepare(
    `INSERT INTO login_attempts (key, attempts, first_attempt_at, blocked_until)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       attempts = excluded.attempts,
       first_attempt_at = excluded.first_attempt_at,
       blocked_until = excluded.blocked_until`,
  ).run(key, attempts, firstAttemptAt, blockedUntil);
}

export async function login(username: string, password: string, request: Request) {
  const key = attemptKey(username, request);
  assertNotBlocked(key);
  const row = getDb().sqlite
    .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
    .get(normalizeText(username)) as UserRow | undefined;
  const valid = row ? await argon2.verify(row.password_hash, password) : false;
  if (!row || !valid) {
    recordFailure(key);
    throw new HttpError(401, "ユーザー名またはパスワードが正しくありません。");
  }
  getDb().sqlite.prepare("DELETE FROM login_attempts WHERE key = ?").run(key);
  return startSession(row.username);
}

function startSession(username: string) {
  const db = getDb().sqlite;
  const user = db
    .prepare("SELECT id, username FROM users WHERE username = ?")
    .get(normalizeText(username)) as { id: string; username: string };
  const token = randomBytes(32).toString("base64url");
  const createdAt = nowIso();
  const days = Math.min(90, Math.max(1, Number(process.env.SESSION_DAYS ?? 30)));
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), user.id, tokenHash(token), expiresAt, createdAt, createdAt);
  return { token, expiresAt, user };
}

export function sessionCookie(token: string, expiresAt: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(expiresAt),
  };
}

export function readSession(token: string | undefined) {
  if (!token) return null;
  const now = nowIso();
  const db = getDb().sqlite;
  const row = db
    .prepare(
      `SELECT u.id, u.username, s.id AS session_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(tokenHash(token), now) as
    | { id: string; username: string; session_id: string }
    | undefined;
  if (!row) return null;
  db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(now, row.session_id);
  return { id: row.id, username: row.username };
}

export async function currentUser() {
  const store = await cookies();
  return readSession(store.get(SESSION_COOKIE)?.value);
}

export async function requireUser() {
  if (!userExists()) redirect("/setup");
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export function requireRequestUser(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const user = readSession(token ? decodeURIComponent(token) : undefined);
  if (!user) throw new HttpError(401, "ログインが必要です。");
  return user;
}

export function revokeSession(token: string | undefined) {
  if (!token) return;
  getDb().sqlite
    .prepare("DELETE FROM sessions WHERE token_hash = ?")
    .run(tokenHash(token));
}
