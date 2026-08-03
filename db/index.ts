import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { INITIAL_SCHEMA_SQL } from "./schema-sql";

type ComicDatabase = ReturnType<typeof createDatabase>;
const CURRENT_SCHEMA_VERSION = 9;

declare global {
  var __comicdb: ComicDatabase | undefined;
}

function dataDirectory() {
  return path.resolve(process.env.DATA_DIR ?? "./data");
}

function createDatabase() {
  const directory = dataDirectory();
  mkdirSync(directory, { recursive: true });
  mkdirSync(path.join(directory, "media", "covers"), { recursive: true });
  mkdirSync(path.join(directory, "media", "thumbs"), { recursive: true });

  const sqlite = new Database(path.join(directory, "comicdb.sqlite"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  const schemaVersion = sqlite.pragma("user_version", { simple: true }) as number;
  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    sqlite.close();
    throw new Error(
      `このデータベースは新しいComicDB（schema v${schemaVersion}）で作成されています。`,
    );
  }
  sqlite.exec(INITIAL_SCHEMA_SQL);
  if (schemaVersion === 0) sqlite.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);

  let ftsAvailable = true;
  try {
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS books_search USING fts5(
        book_id UNINDEXED,
        search_text,
        tokenize='trigram'
      );
    `);
  } catch {
    ftsAvailable = false;
  }

  return {
    sqlite,
    orm: drizzle(sqlite, { schema }),
    ftsAvailable,
    dataDirectory: directory,
  };
}

export function getDb() {
  if (!globalThis.__comicdb) {
    globalThis.__comicdb = createDatabase();
  }
  return globalThis.__comicdb;
}

export function closeDbForTests() {
  globalThis.__comicdb?.sqlite.close();
  globalThis.__comicdb = undefined;
}
