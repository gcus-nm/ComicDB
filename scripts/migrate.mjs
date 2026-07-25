import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { ZipArchive } from "archiver";
import Database from "better-sqlite3";

const dataDir = path.resolve(process.env.DATA_DIR ?? "./data");
const backupDir = path.resolve(process.env.BACKUP_DIR ?? "./backups");
const migrationsDir = path.resolve(process.cwd(), "drizzle");
const mediaDir = path.join(dataDir, "media");

await mkdir(path.join(mediaDir, "covers"), { recursive: true });
await mkdir(path.join(mediaDir, "thumbs"), { recursive: true });
await mkdir(backupDir, { recursive: true });

const migrations = (await readdir(migrationsDir))
  .filter((name) => /^\d+.*\.sql$/u.test(name))
  .sort();
if (!migrations.length) throw new Error("DBマイグレーションが見つかりません。");

const databasePath = path.join(dataDir, "comicdb.sqlite");
const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

const currentVersion = db.pragma("user_version", { simple: true });
const targetVersion = migrations.length;
if (currentVersion > targetVersion) {
  db.close();
  throw new Error(
    `DB schema v${currentVersion} は、このComicDBが対応するv${targetVersion}より新しいため起動できません。`,
  );
}

async function backupBeforeMigration(fromVersion, toVersion) {
  const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const temporaryDb = path.join(backupDir, `.comicdb-${stamp}.sqlite`);
  const destination = path.join(backupDir, `comicdb-${stamp}-pre-migration.zip`);
  await db.backup(temporaryDb);
  try {
    await new Promise((resolve, reject) => {
      const output = createWriteStream(destination, { flags: "wx" });
      const archive = new ZipArchive({ zlib: { level: 6 } });
      output.on("close", resolve);
      output.on("error", reject);
      archive.on("error", reject);
      archive.pipe(output);
      archive.file(temporaryDb, { name: "comicdb.sqlite" });
      archive.directory(mediaDir, "media");
      archive.append(
        JSON.stringify(
          {
            version: 1,
            createdAt: new Date().toISOString(),
            reason: "pre-migration",
            fromSchemaVersion: fromVersion,
            toSchemaVersion: toVersion,
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
    await rm(temporaryDb, { force: true });
  }
  return destination;
}

if (currentVersion < targetVersion) {
  let backupPath = null;
  if (currentVersion > 0) {
    backupPath = await backupBeforeMigration(currentVersion, targetVersion);
    console.log(`Pre-migration backup created: ${backupPath}`);
  }

  try {
    for (let index = currentVersion; index < migrations.length; index += 1) {
      const sql = await readFile(path.join(migrationsDir, migrations[index]), "utf8");
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec(sql);
        db.pragma(`user_version = ${index + 1}`);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  } catch (error) {
    console.error(
      backupPath
        ? `Migration failed. Restore from ${backupPath} before retrying.`
        : "Initial schema creation failed.",
    );
    db.close();
    throw error;
  }
}

db.close();
console.log(`Database schema is ready (v${targetVersion}).`);
