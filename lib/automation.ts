import { createHash, timingSafeEqual } from "node:crypto";
import { getDb } from "@/db";
import { HttpError } from "./security";

export type AutomationScope = "read" | "write";

type AutomationIdentity = {
  actor: string;
  scope: AutomationScope;
  user: { id: string; username: string };
};

type MutationResult = {
  status?: number;
  body: unknown;
};

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/u;

function configuredToken(name: "COMICDB_API_READ_TOKEN" | "COMICDB_API_WRITE_TOKEN") {
  const value = process.env[name]?.trim() ?? "";
  if (!value) return null;
  if (
    value.length < 32 ||
    ["change-me", "replace-me", "password"].includes(value) ||
    value.startsWith("replace-")
  ) {
    throw new Error(`${name}は32文字以上のランダム値にしてください。`);
  }
  return value;
}

function equalToken(actual: string, expected: string | null) {
  if (!expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/u.exec(header);
  if (!match) throw new HttpError(401, "APIトークンが必要です。");
  return match[1];
}

export function requireAutomationUser(
  request: Request,
  requiredScope: AutomationScope,
): AutomationIdentity {
  const readToken = configuredToken("COMICDB_API_READ_TOKEN");
  const writeToken = configuredToken("COMICDB_API_WRITE_TOKEN");
  if (readToken && writeToken && equalToken(readToken, writeToken)) {
    throw new Error("読取用と変更用のAPIトークンには別の値を設定してください。");
  }
  const token = bearerToken(request);
  const scope = equalToken(token, writeToken)
    ? "write"
    : equalToken(token, readToken)
      ? "read"
      : null;
  if (!scope) throw new HttpError(401, "APIトークンが正しくありません。");
  if (requiredScope === "write" && scope !== "write") {
    throw new HttpError(403, "変更用APIトークンが必要です。");
  }
  const user = getDb().sqlite
    .prepare("SELECT id, username FROM users ORDER BY created_at LIMIT 1")
    .get() as { id: string; username: string } | undefined;
  if (!user) throw new HttpError(409, "先に管理者の初期設定を完了してください。");
  return { actor: `api:${scope}`, scope, user };
}

export function assertAutomationMutationRequest(request: Request) {
  if (request.headers.get("x-comicdb-request") !== "1") {
    throw new HttpError(403, "自動化API専用ヘッダーが必要です。");
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "JSONリクエストが必要です。");
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function audit(
  actor: string,
  action: string,
  target: string | null,
  result: "success" | "error",
  detail = "",
) {
  getDb().sqlite.prepare(
    `INSERT INTO api_audit_logs (at, actor, action, target, result, detail)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    new Date().toISOString(),
    actor,
    action,
    target,
    result,
    detail.slice(0, 1000),
  );
}

export async function idempotentAutomationMutation(
  request: Request,
  identity: AutomationIdentity,
  options: {
    scope: string;
    action: string;
    target: string | null;
    input: unknown;
    execute: () => MutationResult | Promise<MutationResult>;
  },
) {
  const key = request.headers.get("idempotency-key") ?? "";
  if (!IDEMPOTENCY_KEY.test(key)) {
    throw new HttpError(
      400,
      "Idempotency-Keyは英数字と._:-を使った8〜128文字にしてください。",
    );
  }
  const requestHash = tokenHash(canonicalJson(options.input));
  const keyHash = tokenHash(key);
  const db = getDb().sqlite;
  db.prepare("DELETE FROM api_idempotency_records WHERE created_at < ?").run(
    new Date(Date.now() - 86_400_000).toISOString(),
  );
  const existing = db.prepare(
    `SELECT scope, request_hash, status, response_json
     FROM api_idempotency_records WHERE actor = ? AND key_hash = ?`,
  ).get(identity.actor, keyHash) as
    | { scope: string; request_hash: string; status: number; response_json: string }
    | undefined;
  if (existing) {
    if (existing.scope !== options.scope || existing.request_hash !== requestHash) {
      throw new HttpError(409, "同じ冪等性キーが異なる操作に使用されています。");
    }
    return Response.json(JSON.parse(existing.response_json), {
      status: existing.status,
      headers: { "Idempotency-Replayed": "true" },
    });
  }

  try {
    const result = await options.execute();
    const status = result.status ?? 200;
    db.prepare(
      `INSERT INTO api_idempotency_records
        (actor, key_hash, scope, request_hash, status, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      identity.actor,
      keyHash,
      options.scope,
      requestHash,
      status,
      JSON.stringify(result.body),
      new Date().toISOString(),
    );
    audit(identity.actor, options.action, options.target, "success");
    return Response.json(result.body, { status });
  } catch (error) {
    audit(
      identity.actor,
      options.action,
      options.target,
      "error",
      error instanceof Error ? error.message : "unknown error",
    );
    throw error;
  }
}

export function listAutomationAudit(limit = 100) {
  return getDb().sqlite.prepare(
    `SELECT id, at, actor, action, target, result, detail
     FROM api_audit_logs ORDER BY id DESC LIMIT ?`,
  ).all(Math.max(1, Math.min(500, limit)));
}
