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

const GOOGLE_ENV_NAMES = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_PICKER_API_KEY",
  "GOOGLE_CLOUD_PROJECT_NUMBER",
  "GOOGLE_TOKEN_ENCRYPTION_KEY",
] as const;

export function googleEnvironmentStatus() {
  const missing = GOOGLE_ENV_NAMES.filter((name) => !process.env[name]?.trim());
  const encodedKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (encodedKey && !missing.includes("GOOGLE_TOKEN_ENCRYPTION_KEY")) {
    const key = /^[0-9a-f]{64}$/iu.test(encodedKey)
      ? Buffer.from(encodedKey, "hex")
      : Buffer.from(encodedKey, "base64url");
    if (key.length !== 32) missing.push("GOOGLE_TOKEN_ENCRYPTION_KEY");
  }
  return { configured: missing.length === 0, missing: [...missing] };
}

export function googleEnvironment() {
  const status = googleEnvironmentStatus();
  if (!status.configured) {
    throw new Error(`Google連携の設定が不足しています: ${status.missing.join(", ")}`);
  }
  return {
    clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
    pickerApiKey: process.env.GOOGLE_PICKER_API_KEY!.trim(),
    projectNumber: process.env.GOOGLE_CLOUD_PROJECT_NUMBER!.trim(),
    encryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY!.trim(),
  };
}
