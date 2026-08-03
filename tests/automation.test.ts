import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbForTests, getDb } from "@/db";
import { GET as listAudit } from "@/app/api/automation/v1/audit/route";
import { GET as listBooks, POST as createBook } from "@/app/api/automation/v1/books/route";
import { DELETE as deleteBook } from "@/app/api/automation/v1/books/[id]/route";

const readToken = "r".repeat(48);
const writeToken = "w".repeat(48);
let temporary = "";

const request = (
  method: string,
  token: string,
  body?: unknown,
  idempotencyKey?: string,
) => new Request("http://localhost:3000/api/automation/v1/books", {
  method,
  headers: {
    Authorization: `Bearer ${token}`,
    ...(body === undefined ? {} : {
      "Content-Type": "application/json",
      "X-ComicDB-Request": "1",
    }),
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  },
  body: body === undefined ? undefined : JSON.stringify(body),
});

beforeEach(() => {
  temporary = mkdtempSync(path.join(os.tmpdir(), "comicdb-automation-"));
  process.env.DATA_DIR = temporary;
  process.env.COMICDB_API_READ_TOKEN = readToken;
  process.env.COMICDB_API_WRITE_TOKEN = writeToken;
  getDb().sqlite.prepare(
    `INSERT INTO users (id, username, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run("user-1", "admin", "unused", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z");
});

afterEach(() => {
  closeDbForTests();
  rmSync(temporary, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.COMICDB_API_READ_TOKEN;
  delete process.env.COMICDB_API_WRITE_TOKEN;
});

describe("automation API", () => {
  it("separates read/write scopes, previews without mutation, and replays writes", async () => {
    const input = { title: "CLI登録テスト" };
    const denied = await createBook(request("POST", readToken, { input, dryRun: true }));
    expect(denied.status).toBe(403);

    const preview = await createBook(request("POST", writeToken, { input, dryRun: true }));
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({ dryRun: true, summary: { targetCount: 1 } });
    expect((await (await listBooks(request("GET", readToken))).json()).total).toBe(0);

    const first = await createBook(request(
      "POST",
      writeToken,
      { input, dryRun: false },
      "book-create-test-001",
    ));
    expect(first.status).toBe(201);
    const created = await first.json() as { id: string };

    const replay = await createBook(request(
      "POST",
      writeToken,
      { input, dryRun: false },
      "book-create-test-001",
    ));
    expect(replay.status).toBe(201);
    expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
    expect((await replay.json() as { id: string }).id).toBe(created.id);
    expect((await (await listBooks(request("GET", readToken))).json()).total).toBe(1);

    const conflict = await createBook(request(
      "POST",
      writeToken,
      { input: { title: "別の本" }, dryRun: false },
      "book-create-test-001",
    ));
    expect(conflict.status).toBe(409);

    const deleteContext = { params: Promise.resolve({ id: created.id }) };
    const deleted = await deleteBook(request(
      "DELETE",
      writeToken,
      { confirmation: created.id, dryRun: false },
      "book-delete-test-001",
    ), deleteContext);
    expect(deleted.status).toBe(200);
    const deleteReplay = await deleteBook(request(
      "DELETE",
      writeToken,
      { confirmation: created.id, dryRun: false },
      "book-delete-test-001",
    ), deleteContext);
    expect(deleteReplay.headers.get("Idempotency-Replayed")).toBe("true");
    expect((await (await listBooks(request("GET", readToken))).json()).total).toBe(0);

    const auditResponse = await listAudit(new Request(
      "http://localhost:3000/api/automation/v1/audit",
      { headers: { Authorization: `Bearer ${readToken}` } },
    ));
    const audit = (await auditResponse.json() as { audit: unknown[] }).audit;
    expect(audit).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "book.create", result: "success" }),
      expect.objectContaining({ action: "book.delete", result: "success" }),
    ]));
  });
});
