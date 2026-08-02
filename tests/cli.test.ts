import { execFile } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const cli = path.join(process.cwd(), "scripts", "comicdb.mjs");
let temporary = "";
let server: http.Server | null = null;

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
  if (temporary) rmSync(temporary, { recursive: true, force: true });
  temporary = "";
});

describe("ComicDB CLI", () => {
  it("prints one-line JSON for a successful API response", async () => {
    server = http.createServer((_request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ books: [], total: 0, page: 1, pages: 1 }));
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server failed");
    const result = await execute(process.execPath, [cli, "books", "list", "--json"], {
      env: {
        ...process.env,
        COMICDB_API_URL: `http://127.0.0.1:${address.port}`,
        COMICDB_API_READ_TOKEN: "r".repeat(48),
      },
    });
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ total: 0 });
  });

  it("rejects a real write without confirmation using a structured error exit", async () => {
    temporary = mkdtempSync(path.join(os.tmpdir(), "comicdb-cli-"));
    const input = path.join(temporary, "book.json");
    writeFileSync(input, JSON.stringify({ title: "安全確認" }));
    try {
      await execute(process.execPath, [cli, "books", "create", "--input", input, "--json"], {
        env: { ...process.env, COMICDB_API_WRITE_TOKEN: "w".repeat(48) },
      });
      throw new Error("CLI unexpectedly succeeded");
    } catch (error) {
      const failure = error as { code: number; stderr: string; stdout: string };
      expect(failure.code).toBe(4);
      expect(failure.stdout).toBe("");
      expect(JSON.parse(failure.stderr)).toMatchObject({
        error: { code: "confirmation_required", retryable: false },
      });
    }
  });
});
