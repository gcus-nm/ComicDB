import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbForTests } from "@/db";
import { createAdmin, login, readSession, revokeSession } from "@/lib/auth";

let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "comicdb-auth-"));
  process.env.DATA_DIR = tempDir;
});

afterEach(() => {
  closeDbForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("認証", () => {
  it("管理者を作成し、ログインと失効を扱う", async () => {
    const created = await createAdmin("owner", "a-very-long-password");
    expect(readSession(created.token)?.username).toBe("owner");

    const signedIn = await login(
      "OWNER",
      "a-very-long-password",
      new Request("http://localhost/api/login"),
    );
    expect(readSession(signedIn.token)?.username).toBe("owner");
    revokeSession(signedIn.token);
    expect(readSession(signedIn.token)).toBeNull();
  });
});
