import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import unzipper from "unzipper";

const args = process.argv.slice(2);
const fromIndex = args.indexOf("--from");
const confirmed = args.includes("--confirm");
const source = fromIndex >= 0 ? args[fromIndex + 1] : "";
const dataDir = path.resolve(process.env.DATA_DIR ?? "/data");

if (!source || !confirmed) {
  console.error("Usage: npm run restore -- --from /backups/comicdb-....zip --confirm");
  process.exit(2);
}
if (!existsSync(source) || !source.endsWith(".zip")) {
  console.error("Backup archive was not found.");
  process.exit(2);
}

const rollbackDir = path.join(dataDir, `pre-restore-${new Date().toISOString().replaceAll(":", "-")}`);
const extractDir = path.join(dataDir, `.restore-${process.pid}`);
await mkdir(rollbackDir, { recursive: true });
await mkdir(extractDir, { recursive: true });

for (const name of ["comicdb.sqlite", "comicdb.sqlite-wal", "comicdb.sqlite-shm", "media"]) {
  const target = path.join(dataDir, name);
  if (existsSync(target)) await rename(target, path.join(rollbackDir, name));
}

try {
  const archive = createReadStream(source).pipe(unzipper.Parse({ forceStream: true }));
  for await (const entry of archive) {
    const normalized = path.normalize(entry.path).replace(/^(\.\.(\/|\\|$))+/u, "");
    const target = path.resolve(extractDir, normalized);
    if (!target.startsWith(`${extractDir}${path.sep}`)) {
      entry.autodrain();
      throw new Error("Unsafe path in backup archive.");
    }
    if (entry.type === "Directory") {
      await mkdir(target, { recursive: true });
      entry.autodrain();
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await new Promise((resolve, reject) => {
      const output = createWriteStream(target);
      entry.pipe(output);
      output.on("finish", resolve);
      output.on("error", reject);
    });
  }
  for (const name of ["comicdb.sqlite", "media"]) {
    const target = path.join(extractDir, name);
    if (!existsSync(target)) throw new Error(`Backup is missing ${name}.`);
    await rename(target, path.join(dataDir, name));
  }
  await rm(extractDir, { recursive: true, force: true });
  console.log(`Restore completed. Previous data is preserved at ${rollbackDir}`);
} catch (error) {
  await rm(extractDir, { recursive: true, force: true });
  for (const name of await readdir(rollbackDir)) {
    await rename(path.join(rollbackDir, name), path.join(dataDir, name));
  }
  console.error(error);
  process.exit(1);
}
