import { createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import * as archiverNamespace from "archiver";
import { getDb } from "@/db";
import { backupDirectory, dataDirectory } from "./env";

declare global {
  var __comicdbBackupScheduler: boolean | undefined;
}

type ArchiverFactory = (
  format: archiverNamespace.Format,
  options?: archiverNamespace.ArchiverOptions,
) => archiverNamespace.Archiver;

type ZipArchiveConstructor = new (
  options?: archiverNamespace.ArchiverOptions,
) => archiverNamespace.Archiver;

function createZipArchive(options: archiverNamespace.ArchiverOptions) {
  const namespace = archiverNamespace as unknown as {
    ZipArchive?: ZipArchiveConstructor;
  };
  if (namespace.ZipArchive) return new namespace.ZipArchive(options);

  let candidate: unknown = archiverNamespace;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof candidate === "function") {
      return (candidate as ArchiverFactory)("zip", options);
    }
    if (!candidate || typeof candidate !== "object") break;
    candidate = (candidate as { default?: unknown }).default;
  }
  throw new Error("ZIPバックアップ機能を初期化できませんでした。");
}

function backupStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/gu, "-");
}

async function directorySize(directory: string): Promise<number> {
  let total = 0;
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      total += entry.isDirectory() ? await directorySize(target) : (await stat(target)).size;
    }
  } catch {
    return total;
  }
  return total;
}

async function pruneBackups(keep = 30) {
  const directory = backupDirectory();
  const files = (await readdir(directory))
    .filter((name) => /^comicdb-\d{4}-/u.test(name) && name.endsWith(".zip"))
    .sort()
    .reverse();
  await Promise.all(files.slice(keep).map((name) => rm(path.join(directory, name))));
}

export async function createBackup(reason: "manual" | "automatic" = "manual") {
  const directory = backupDirectory();
  await mkdir(directory, { recursive: true });
  const stamp = backupStamp();
  const tempDb = path.join(directory, `.comicdb-${stamp}.sqlite`);
  const destination = path.join(directory, `comicdb-${stamp}.zip`);
  await getDb().sqlite.backup(tempDb);

  try {
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(destination, { flags: "wx" });
      const archive = createZipArchive({ zlib: { level: 6 } });
      output.on("close", resolve);
      output.on("error", reject);
      archive.on("error", reject);
      archive.pipe(output);
      archive.file(tempDb, { name: "comicdb.sqlite" });
      archive.directory(path.join(dataDirectory(), "media"), "media");
      archive.append(
        JSON.stringify(
          {
            version: 1,
            createdAt: new Date().toISOString(),
            reason,
          },
          null,
          2,
        ),
        { name: "backup.json" },
      );
      void archive.finalize();
    });
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  } finally {
    await rm(tempDb, { force: true });
  }
  await pruneBackups();
  getDb()
    .sqlite.prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('last_backup', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(destination, new Date().toISOString());
  return { name: path.basename(destination), path: destination };
}

export async function backupStatus() {
  const row = getDb().sqlite
    .prepare("SELECT value, updated_at FROM app_settings WHERE key = 'last_backup'")
    .get() as { value: string; updated_at: string } | undefined;
  return {
    lastBackupAt: row?.updated_at ?? null,
    lastBackupName: row?.value ? path.basename(row.value) : null,
    dataBytes: await directorySize(dataDirectory()),
    backupBytes: await directorySize(backupDirectory()),
  };
}

async function runAutomaticBackupIfDue() {
  if ((process.env.AUTO_BACKUP ?? "true") !== "true") return;
  const row = getDb().sqlite
    .prepare("SELECT updated_at FROM app_settings WHERE key = 'last_backup'")
    .get() as { updated_at: string } | undefined;
  if (!row || Date.now() - Date.parse(row.updated_at) >= 23 * 60 * 60 * 1000) {
    await createBackup("automatic");
  }
}

export function startBackupScheduler() {
  if (globalThis.__comicdbBackupScheduler) return;
  globalThis.__comicdbBackupScheduler = true;
  const run = () => {
    void runAutomaticBackupIfDue().catch((error) => {
      console.error("Automatic backup failed", error);
    });
  };
  const first = setTimeout(run, 60_000);
  const interval = setInterval(run, 60 * 60 * 1000);
  first.unref();
  interval.unref();
}
