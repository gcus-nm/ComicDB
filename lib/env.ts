import path from "node:path";

export function appOrigin() {
  const value = process.env.APP_ORIGIN ?? "http://localhost:3000";
  try {
    return new URL(value);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export function dataDirectory() {
  return path.resolve(process.env.DATA_DIR ?? "./data");
}

export function backupDirectory() {
  return path.resolve(process.env.BACKUP_DIR ?? "./backups");
}

export function secureCookies() {
  return appOrigin().protocol === "https:";
}
