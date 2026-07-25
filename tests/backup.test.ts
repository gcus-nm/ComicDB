import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import unzipper from "unzipper";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbForTests, getDb } from "@/db";
import { createBackup } from "@/lib/backup";

let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "comicdb-backup-"));
  process.env.DATA_DIR = path.join(tempDir, "data");
  process.env.BACKUP_DIR = path.join(tempDir, "backups");
});

afterEach(() => {
  closeDbForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("バックアップ", () => {
  it("整合性のあるSQLiteとメタデータをZIPへ保存する", async () => {
    getDb().sqlite
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('backup-test', 'ok', ?)`,
      )
      .run(new Date().toISOString());

    const backup = await createBackup("manual");
    const archive = await unzipper.Open.file(backup.path);
    const paths = archive.files.map((entry) => entry.path);

    expect(backup.name).toMatch(/^comicdb-.*\.zip$/u);
    expect(paths).toContain("comicdb.sqlite");
    expect(paths).toContain("backup.json");
  });
});
