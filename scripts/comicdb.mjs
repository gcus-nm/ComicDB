#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { pathToFileURL } from "node:url";

const HELP = `ComicDB CLI

Usage:
  npm run cli -- books list [--q text] [--page n] [--limit n] [--json]
  npm run cli -- books get <id> [--json]
  npm run cli -- books create --input <file|-> --dry-run [--json]
  npm run cli -- books create --input <file|-> --confirm <origin> --idempotency-key <key> [--json]
  npm run cli -- books update <id> --input <file|-> --dry-run [--json]
  npm run cli -- books update <id> --input <file|-> --confirm <origin> --idempotency-key <key> [--json]
  npm run cli -- books delete <id> --dry-run --confirm-delete <id> [--json]
  npm run cli -- books delete <id> --confirm-delete <id> --confirm <origin> --idempotency-key <key> [--json]
  npm run cli -- events list [--limit n] [--json]
  npm run cli -- events get <id> [--json]
  npm run cli -- events create --input <file|-> --dry-run [--json]
  npm run cli -- events update <id> --input <file|-> --dry-run [--json]
  npm run cli -- audit [--limit n] [--json]

Configuration:
  COMICDB_API_URL          API origin (default: http://127.0.0.1:3000)
  COMICDB_API_READ_TOKEN   Read-only Bearer token
  COMICDB_API_WRITE_TOKEN  Write Bearer token
  COMICDB_CA_CERT          Optional PEM CA for a private HTTPS endpoint
  COMICDB_IDEMPOTENCY_KEY  Optional alternative to --idempotency-key

Examples:
  npm run cli -- books list --q 総集編 --json
  npm run cli -- books create --input book.json --dry-run --json
  npm run cli -- events create --input event.json --confirm http://127.0.0.1:3000 --idempotency-key event-comitia-01 --json

Tokens are read only from the environment and are never accepted in arguments or URLs.`;

class CliError extends Error {
  constructor(code, message, { target = null, retryable = false, exitCode = 1, details = null } = {}) {
    super(message);
    this.code = code;
    this.target = target;
    this.retryable = retryable;
    this.exitCode = exitCode;
    this.details = details;
  }
}

const takeOption = (args, name) => {
  const index = args.indexOf(name);
  if (index < 0) return null;
  if (!args[index + 1] || args[index + 1].startsWith("--")) {
    throw new CliError("usage_error", `${name} requires a value`, { target: name, exitCode: 2 });
  }
  return args.splice(index, 2)[1];
};

const takeFlag = (args, name) => {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
};

const integer = (value, name, minimum, maximum) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new CliError("validation_error", `${name} must be ${minimum}..${maximum}`, { target: name, exitCode: 4 });
  }
  return parsed;
};

const inputObject = async (path) => {
  try {
    const raw = path === "-"
      ? await new Promise((resolve, reject) => {
          const chunks = [];
          process.stdin.on("data", (chunk) => chunks.push(chunk));
          process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
          process.stdin.on("error", reject);
        })
      : await readFile(path, "utf8");
    const value = JSON.parse(raw);
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("JSON object required");
    return value;
  } catch (error) {
    throw new CliError("input_error", `JSON input could not be read: ${error.message}`, { target: path, exitCode: 4 });
  }
};

const requestJson = (baseUrl, path, token, { method = "GET", body, idempotencyKey, caFile } = {}) =>
  new Promise((resolve, reject) => {
    if (!token) {
      reject(new CliError("configuration_error", "the required API token is not configured", {
        target: method === "GET" ? "COMICDB_API_READ_TOKEN" : "COMICDB_API_WRITE_TOKEN", exitCode: 3
      }));
      return;
    }
    const target = new URL(path, baseUrl);
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
    if (payload !== null) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
      headers["X-ComicDB-Request"] = "1";
    }
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const transport = target.protocol === "https:" ? https : http;
    const request = transport.request({
      method,
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      headers,
      timeout: 15_000,
      ...(target.protocol === "https:" && caFile ? { ca: readFileSync(caFile) } : {})
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let data;
        try { data = raw ? JSON.parse(raw) : null; }
        catch {
          reject(new CliError("invalid_response", "API returned non-JSON data", {
            target: target.pathname, retryable: true, exitCode: 5
          }));
          return;
        }
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          const retryable = status === 408 || status === 425 || status === 429 || status >= 500;
          reject(new CliError("api_error", data?.error ?? `HTTP ${status}`, {
            target: target.pathname,
            retryable,
            exitCode: retryable ? 5 : 6,
            details: { status, response: data }
          }));
          return;
        }
        resolve(data);
      });
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", (error) => reject(new CliError("network_error", error.message, {
      target: target.origin, retryable: true, exitCode: 5
    })));
    if (payload !== null) request.write(payload);
    request.end();
  });

const requireWriteSafety = (baseUrl, dryRun, confirmation, idempotencyKey) => {
  if (dryRun && confirmation) {
    throw new CliError("usage_error", "--dry-run and --confirm cannot be combined", { exitCode: 2 });
  }
  if (!dryRun && confirmation !== baseUrl.origin) {
    throw new CliError("confirmation_required", `real changes require --confirm ${baseUrl.origin}`, {
      target: baseUrl.origin, exitCode: 4
    });
  }
  if (!dryRun && !idempotencyKey) {
    throw new CliError("idempotency_key_required", "real changes require --idempotency-key or COMICDB_IDEMPOTENCY_KEY", {
      target: baseUrl.origin, exitCode: 4
    });
  }
};

export const main = async (argv = process.argv.slice(2), env = process.env) => {
  const args = [...argv];
  if (args.length === 0 || takeFlag(args, "--help") || takeFlag(args, "-h")) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const json = takeFlag(args, "--json");
  const baseRaw = takeOption(args, "--base-url") ?? env.COMICDB_API_URL ?? "http://127.0.0.1:3000";
  const caFile = takeOption(args, "--ca-file") ?? env.COMICDB_CA_CERT ?? null;
  let baseUrl;
  try { baseUrl = new URL(baseRaw); }
  catch { throw new CliError("configuration_error", "COMICDB_API_URL must be a valid origin", { exitCode: 3 }); }
  if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password
    || baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) {
    throw new CliError("configuration_error", "COMICDB_API_URL must be an HTTP(S) origin without credentials or a path", { exitCode: 3 });
  }

  const resource = args.shift();
  const command = args.shift();
  let path;
  let method = "GET";
  let body;
  let write = false;
  let idempotencyKey = null;

  if (resource === "books" && command === "list") {
    const query = new URLSearchParams();
    for (const [option, parameter] of [
      ["--q", "q"], ["--adult-rating", "adultRating"], ["--read-status", "readStatus"],
      ["--ownership-status", "ownershipStatus"], ["--event-id", "eventId"],
      ["--storage-id", "storageId"], ["--tag", "tag"]
    ]) {
      const value = takeOption(args, option);
      if (value) query.set(parameter, value);
    }
    if (takeFlag(args, "--favorite")) query.set("favorite", "true");
    query.set("page", String(integer(takeOption(args, "--page") ?? "1", "--page", 1, 1_000_000)));
    query.set("limit", String(integer(takeOption(args, "--limit") ?? "100", "--limit", 1, 2_000)));
    path = `/api/automation/v1/books?${query}`;
  } else if (resource === "events" && command === "list") {
    const limit = integer(takeOption(args, "--limit") ?? "100", "--limit", 1, 500);
    path = `/api/automation/v1/events?limit=${limit}`;
  } else if (resource === "audit" && command === undefined) {
    const limit = integer(takeOption(args, "--limit") ?? "100", "--limit", 1, 500);
    path = `/api/automation/v1/audit?limit=${limit}`;
  } else if ((resource === "books" || resource === "events") && command === "get") {
    const id = args.shift();
    if (!id) throw new CliError("usage_error", "get requires an id", { exitCode: 2 });
    path = `/api/automation/v1/${resource}/${encodeURIComponent(id)}`;
  } else if ((resource === "books" || resource === "events") && ["create", "update"].includes(command)) {
    const id = command === "update" ? args.shift() : null;
    if (command === "update" && !id) throw new CliError("usage_error", "update requires an id", { exitCode: 2 });
    const inputPath = takeOption(args, "--input");
    if (!inputPath) throw new CliError("usage_error", `${command} requires --input`, { exitCode: 2 });
    const dryRun = takeFlag(args, "--dry-run");
    const confirmation = takeOption(args, "--confirm");
    idempotencyKey = takeOption(args, "--idempotency-key") ?? env.COMICDB_IDEMPOTENCY_KEY ?? null;
    requireWriteSafety(baseUrl, dryRun, confirmation, idempotencyKey);
    body = { input: await inputObject(inputPath), dryRun };
    path = command === "create"
      ? `/api/automation/v1/${resource}`
      : `/api/automation/v1/${resource}/${encodeURIComponent(id)}`;
    method = command === "create" ? "POST" : "PATCH";
    write = true;
  } else if (resource === "books" && command === "delete") {
    const id = args.shift();
    if (!id) throw new CliError("usage_error", "delete requires an id", { exitCode: 2 });
    const dryRun = takeFlag(args, "--dry-run");
    const confirmation = takeOption(args, "--confirm");
    const deleteConfirmation = takeOption(args, "--confirm-delete");
    if (deleteConfirmation !== id) {
      throw new CliError("destructive_confirmation_required", `delete requires --confirm-delete ${id}`, {
        target: id, exitCode: 4
      });
    }
    idempotencyKey = takeOption(args, "--idempotency-key") ?? env.COMICDB_IDEMPOTENCY_KEY ?? null;
    requireWriteSafety(baseUrl, dryRun, confirmation, idempotencyKey);
    path = `/api/automation/v1/books/${encodeURIComponent(id)}`;
    method = "DELETE";
    body = { confirmation: id, dryRun };
    write = true;
  } else {
    throw new CliError("usage_error", "unknown command; use --help", { target: resource ?? null, exitCode: 2 });
  }
  if (args.length) throw new CliError("usage_error", `unexpected arguments: ${args.join(" ")}`, { exitCode: 2 });

  const token = write
    ? env.COMICDB_API_WRITE_TOKEN
    : env.COMICDB_API_READ_TOKEN ?? env.COMICDB_API_WRITE_TOKEN;
  const result = await requestJson(baseUrl, path, token, { method, body, idempotencyKey, caFile });
  process.stdout.write(`${JSON.stringify(result, null, json ? 0 : 2)}\n`);
  return 0;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    const failure = error instanceof CliError ? error : new CliError("internal_error", String(error));
    process.stderr.write(`${JSON.stringify({ error: {
      code: failure.code,
      message: failure.message,
      target: failure.target,
      retryable: failure.retryable,
      details: failure.details
    } })}\n`);
    process.exitCode = failure.exitCode;
  });
}
