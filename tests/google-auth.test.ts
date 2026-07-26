import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { google } from "googleapis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDbForTests, getDb } from "@/db";
import { createAdmin, readSession } from "@/lib/auth";
import {
  beginGoogleOAuth,
  completeGoogleOAuth,
  consumeGoogleOAuthState,
  decryptGoogleRefreshToken,
  encryptGoogleRefreshToken,
  getGoogleIntegration,
} from "@/lib/google-auth";
import { errorResponse, HttpError } from "@/lib/security";

let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "comicdb-google-auth-"));
  process.env.DATA_DIR = tempDir;
  process.env.APP_ORIGIN = "https://comicdb.example";
  process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  process.env.GOOGLE_PICKER_API_KEY = "picker-key";
  process.env.GOOGLE_CLOUD_PROJECT_NUMBER = "123456789";
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
    "base64url",
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  closeDbForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("Google OAuth", () => {
  it("Refresh TokenをAES-256-GCMで暗号化し、改ざんを検出する", () => {
    const first = encryptGoogleRefreshToken("refresh-token-value");
    const second = encryptGoogleRefreshToken("refresh-token-value");
    expect(first).not.toContain("refresh-token-value");
    expect(first).not.toBe(second);
    expect(decryptGoogleRefreshToken(first)).toBe("refresh-token-value");

    const parts = first.split(".");
    parts[2] = `${parts[2]!.startsWith("A") ? "B" : "A"}${parts[2]!.slice(1)}`;
    const tampered = parts.join(".");
    expect(() => decryptGoogleRefreshToken(tampered)).toThrow();
  });

  it("OAuth stateをComicDBセッションへ結び付け、一度だけ使用できる", async () => {
    const session = await createAdmin("owner", "a-very-long-password");
    const user = readSession(session.token)!;
    const authorizationUrl = new URL(
      beginGoogleOAuth(user.id, user.sessionId),
    );
    const state = authorizationUrl.searchParams.get("state")!;

    expect(authorizationUrl.searchParams.get("access_type")).toBe("offline");
    expect(authorizationUrl.searchParams.get("prompt")).toBe("consent");
    expect(authorizationUrl.searchParams.get("scope")).toContain(
      "https://www.googleapis.com/auth/drive.file",
    );
    expect(() =>
      consumeGoogleOAuthState(state, user.id, "another-session"),
    ).toThrow(HttpError);
    expect(() =>
      consumeGoogleOAuthState(state, user.id, user.sessionId),
    ).not.toThrow();
    expect(() =>
      consumeGoogleOAuthState(state, user.id, user.sessionId),
    ).toThrow(/既に使用/u);
  });

  it("期限切れstateを拒否して再利用できないようにする", async () => {
    const session = await createAdmin("owner", "a-very-long-password");
    const user = readSession(session.token)!;
    const authorizationUrl = new URL(
      beginGoogleOAuth(user.id, user.sessionId),
    );
    getDb().sqlite
      .prepare("UPDATE google_oauth_states SET expires_at = ?")
      .run("2000-01-01T00:00:00.000Z");

    const state = authorizationUrl.searchParams.get("state")!;
    expect(() =>
      consumeGoogleOAuthState(state, user.id, user.sessionId),
    ).toThrow(/有効期限/u);
    expect(() =>
      consumeGoogleOAuthState(state, user.id, user.sessionId),
    ).toThrow(/既に使用/u);
  });

  it("invalid_grantを再接続が必要な401へ変換する", async () => {
    const response = errorResponse(new Error("invalid_grant"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Googleの認可が失効しています。接続し直してください。",
    });
  });

  it("Refresh Tokenだけを暗号化保存し、別アカウント再接続時は旧シートを外す", async () => {
    const session = await createAdmin("owner", "a-very-long-password");
    const user = readSession(session.token)!;
    vi.spyOn(google.auth.OAuth2.prototype, "getToken")
      .mockResolvedValueOnce({
        tokens: {
          refresh_token: "first-refresh-token",
          scope: "https://www.googleapis.com/auth/drive.file",
        },
        res: null,
      } as never)
      .mockResolvedValueOnce({
        tokens: {
          refresh_token: "second-refresh-token",
          scope: "https://www.googleapis.com/auth/drive.file",
        },
        res: null,
      } as never);
    vi.spyOn(google, "drive")
      .mockReturnValueOnce({
        about: {
          get: vi.fn().mockResolvedValue({
            data: {
              user: {
                permissionId: "google-account-a",
                emailAddress: "a@example.com",
              },
            },
          }),
        },
      } as never)
      .mockReturnValueOnce({
        about: {
          get: vi.fn().mockResolvedValue({
            data: {
              user: {
                permissionId: "google-account-b",
                emailAddress: "b@example.com",
              },
            },
          }),
        },
      } as never);

    const firstUrl = new URL(beginGoogleOAuth(user.id, user.sessionId));
    await completeGoogleOAuth(
      "first-code",
      firstUrl.searchParams.get("state")!,
      user.id,
      user.sessionId,
    );
    const first = getGoogleIntegration(user.id)!;
    expect(first.encrypted_refresh_token).not.toContain("first-refresh-token");
    expect(decryptGoogleRefreshToken(first.encrypted_refresh_token)).toBe(
      "first-refresh-token",
    );
    getDb().sqlite
      .prepare(
        `UPDATE google_integrations SET
           spreadsheet_id = 'sheet-a', spreadsheet_name = '旧シート',
           sheet_id = 123, sheet_title = 'ComicDB蔵書'
         WHERE user_id = ?`,
      )
      .run(user.id);

    const secondUrl = new URL(beginGoogleOAuth(user.id, user.sessionId));
    await completeGoogleOAuth(
      "second-code",
      secondUrl.searchParams.get("state")!,
      user.id,
      user.sessionId,
    );
    const second = getGoogleIntegration(user.id)!;
    expect(second.google_subject).toBe("google-account-b");
    expect(second.google_email).toBe("b@example.com");
    expect(second.spreadsheet_id).toBeNull();
    expect(decryptGoogleRefreshToken(second.encrypted_refresh_token)).toBe(
      "second-refresh-token",
    );
  });
});
