import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

let tempDir = "";

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = "";
});

describe("DBマイグレーション", () => {
  it("v6のデータを引き継ぎ、イベントの関連リンク列まで追加してv12へ移行する", () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "comicdb-migration-"));
    const dataDir = path.join(tempDir, "data");
    const backupDir = path.join(tempDir, "backups");
    mkdirSync(dataDir, { recursive: true });
    const databasePath = path.join(dataDir, "comicdb.sqlite");
    const database = new Database(databasePath);

    for (const name of [
      "0000_initial.sql",
      "0001_taxonomy_hierarchy.sql",
      "0002_book_ownership_status.sql",
      "0003_google_sheets_integration.sql",
      "0004_event_wishlist.sql",
      "0005_event_wishlist_day.sql",
    ]) {
      database.exec(
        readFileSync(path.join(process.cwd(), "drizzle", name), "utf8"),
      );
    }
    database.pragma("user_version = 6");
    database
      .prepare(
        `INSERT INTO events
          (id, name, starts_on, ends_on, wishlist_day, venue, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "event-1",
        "移行テスト",
        "2026-08-11",
        "2026-08-13",
        2,
        "",
        "",
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
      );
    database
      .prepare(
        `INSERT INTO books
          (id, title, normalized_title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        "book-1",
        "移行対象",
        "移行対象",
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
      );
    database
      .prepare(
        `INSERT INTO acquisitions
          (id, book_id, event_id, quantity, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "acquisition-1",
        "book-1",
        "event-1",
        1,
        "",
        "2026-01-01T00:00:00.000Z",
      );
    database
      .prepare(
        `INSERT INTO wishlist_items
          (id, event_id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        "wishlist-1",
        "event-1",
        "移行対象",
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
      );
    database.close();

    execFileSync(process.execPath, ["scripts/migrate.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATA_DIR: dataDir,
        BACKUP_DIR: backupDir,
      },
    });

    const migrated = new Database(databasePath, { readonly: true });
    expect(migrated.pragma("user_version", { simple: true })).toBe(12);
    expect(
      migrated
        .prepare("SELECT event_day FROM wishlist_items WHERE id = ?")
        .pluck()
        .get("wishlist-1"),
    ).toBe(2);
    expect(
      migrated
        .prepare("SELECT links FROM books WHERE id = ?")
        .pluck()
        .get("book-1"),
    ).toBe("[]");
    expect(
      migrated
        .prepare("SELECT links FROM wishlist_items WHERE id = ?")
        .pluck()
        .get("wishlist-1"),
    ).toBe("[]");
    expect(
      migrated
        .prepare("SELECT links FROM events WHERE id = ?")
        .pluck()
        .get("event-1"),
    ).toBe("[]");
    expect(
      migrated
        .prepare(
          `SELECT COUNT(*)
           FROM pragma_table_info('events')
           WHERE name = 'wishlist_day'`,
        )
        .pluck()
        .get(),
    ).toBe(0);
    expect(
      migrated
        .prepare("SELECT COUNT(*) FROM wishlist_items WHERE event_id = ?")
        .pluck()
        .get("event-1"),
    ).toBe(1);
    expect(
      migrated
        .prepare("SELECT COUNT(*) FROM acquisitions WHERE event_id = ?")
        .pluck()
        .get("event-1"),
    ).toBe(1);
    expect(
      migrated
        .prepare(
          `SELECT COUNT(*)
           FROM pragma_table_info('wishlist_items')
           WHERE name = 'book_id'`,
        )
        .pluck()
        .get(),
    ).toBe(1);
    expect(
      migrated
        .prepare("SELECT book_id FROM wishlist_items WHERE id = ?")
        .pluck()
        .get("wishlist-1"),
    ).toBeNull();
    expect(
      migrated
        .prepare(
          `SELECT creators, fandom_tag_ids, adult_rating, cover_path
           FROM wishlist_items WHERE id = ?`,
        )
        .get("wishlist-1"),
    ).toEqual({
      creators: "",
      fandom_tag_ids: "[]",
      adult_rating: "general",
      cover_path: null,
    });
    expect(
      migrated
        .prepare(
          `SELECT COUNT(*) FROM sqlite_master
           WHERE type = 'table' AND name IN ('api_audit_logs', 'api_idempotency_records')`,
        )
        .pluck()
        .get(),
    ).toBe(2);
    migrated.close();

    expect(
      readdirSync(backupDir).some((name) =>
        name.endsWith("-pre-migration.zip"),
      ),
    ).toBe(true);
  });
});
