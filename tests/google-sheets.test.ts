import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { google } from "googleapis";
import { closeDbForTests, getDb } from "@/db";
import { createAdmin } from "@/lib/auth";
import { createBook, getBook } from "@/lib/catalog";
import { encryptGoogleRefreshToken } from "@/lib/google-auth";
import {
  GOOGLE_SHEET_HEADERS,
  applyGoogleSheetPull,
  classifyGoogleSheetValues,
  connectGoogleSpreadsheet,
  createGoogleSpreadsheet,
  googleSheetRowForBook,
  inspectGoogleSpreadsheet,
  previewGoogleSheetPull,
} from "@/lib/google-sheets";
import { HttpError } from "@/lib/security";

let tempDir = "";

const bookInput = {
  title: "Google同期テスト",
  circles: "表計算部",
  creators: "作者A",
  fandoms: "作品A",
  characters: "",
  pairings: "",
  genres: "漫画",
  tags: "",
  adultRating: "general" as const,
  publishedOn: "2026-07-01",
  edition: "",
  storageLocationId: null,
  storageLocation: "本棚A",
  readStatus: "unread" as const,
  ownershipStatus: "owned" as const,
  favorite: false,
  notes: "",
  eventId: null,
  eventName: "",
  purchasedOn: "2026-07-02",
  priceYen: 500,
  quantity: 1,
  acquisitionNotes: "",
};

function newSheetRow(title: string) {
  return [
    title,
    "新規サークル",
    "",
    "",
    "",
    "",
    "",
    "",
    "全年齢",
    "",
    "",
    "",
    "",
    "",
    "1",
    "",
    "所持中",
    "未読",
    "",
    "",
    "",
    "",
  ];
}

async function integrationUser() {
  const session = await createAdmin("owner", "a-very-long-password");
  const now = new Date().toISOString();
  getDb().sqlite
    .prepare(
      `INSERT INTO google_integrations
        (user_id, google_subject, google_email, encrypted_refresh_token,
         granted_scopes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      session.user.id,
      "google-subject",
      "owner@example.com",
      encryptGoogleRefreshToken("refresh-token"),
      "https://www.googleapis.com/auth/drive.file",
      now,
      now,
    );
  return session.user.id;
}

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "comicdb-google-sheet-"));
  process.env.DATA_DIR = tempDir;
  process.env.APP_ORIGIN = "https://comicdb.example";
  process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  process.env.GOOGLE_PICKER_API_KEY = "picker-key";
  process.env.GOOGLE_CLOUD_PROJECT_NUMBER = "123456789";
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
    "base64url",
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  closeDbForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("Googleシート差分分類", () => {
  it("変更なし・更新・競合・購入列変更を分類する", () => {
    const book = createBook(bookInput);
    const current = googleSheetRowForBook(book.id)!;
    const unchanged = classifyGoogleSheetValues([
      [...GOOGLE_SHEET_HEADERS],
      [...current],
    ]);
    expect(unchanged.counts.unchanged).toBe(1);

    const purchaseChanged = [...current];
    purchaseChanged[13] = 999;
    const purchasePreview = classifyGoogleSheetValues([
      [...GOOGLE_SHEET_HEADERS],
      purchaseChanged,
    ]);
    expect(purchasePreview.rows[0]?.status).toBe("unchanged");
    expect(purchasePreview.rows[0]?.warnings.join()).toContain("参照専用");

    const edited = [...current];
    edited[19] = "シートで編集";
    expect(
      classifyGoogleSheetValues([[...GOOGLE_SHEET_HEADERS], edited]).rows[0]
        ?.status,
    ).toBe("update");

    getDb().sqlite
      .prepare("UPDATE books SET notes = ?, updated_at = ? WHERE id = ?")
      .run("ComicDBでも編集", "2030-01-01T00:00:00.000Z", book.id);
    const conflicted = [...current];
    conflicted[0] = "シートでも編集";
    expect(
      classifyGoogleSheetValues([[...GOOGLE_SHEET_HEADERS], conflicted])
        .rows[0]?.status,
    ).toBe("conflict");
  });

  it("新規・式・入力エラー・重複ID・重複候補・行欠落を扱う", () => {
    const book = createBook(bookInput);
    const current = googleSheetRowForBook(book.id)!;
    const duplicateId = [...current];
    duplicateId[0] = "別タイトル";
    const formula = newSheetRow("=A1");
    const invalidDate = newSheetRow("日付エラー");
    invalidDate[9] = "2026/07/01";
    const duplicateCandidate = newSheetRow(book.title);
    const preview = classifyGoogleSheetValues([
      [...GOOGLE_SHEET_HEADERS],
      current,
      duplicateId,
      formula,
      invalidDate,
      duplicateCandidate,
    ]);

    expect(preview.rows[0]?.status).toBe("error");
    expect(preview.rows[1]?.errors.join()).toContain("重複");
    expect(preview.rows[2]?.errors.join()).toContain("式セル");
    expect(preview.rows[3]?.errors.join()).toContain("日付形式");
    expect(preview.rows[4]?.status).toBe("new");
    expect(preview.rows[4]?.duplicateCount).toBeGreaterThan(0);
    expect(
      classifyGoogleSheetValues([[...GOOGLE_SHEET_HEADERS]]).rows,
    ).toEqual([]);
  });

  it("5,000行上限とシート内容ハッシュの変更を検出する", () => {
    const rows = Array.from({ length: 5001 }, (_, index) =>
      newSheetRow(`新規${index}`),
    );
    expect(() =>
      classifyGoogleSheetValues([[...GOOGLE_SHEET_HEADERS], ...rows]),
    ).toThrow(HttpError);

    const first = classifyGoogleSheetValues([
      [...GOOGLE_SHEET_HEADERS],
      newSheetRow("A"),
    ]);
    const second = classifyGoogleSheetValues([
      [...GOOGLE_SHEET_HEADERS],
      newSheetRow("B"),
    ]);
    expect(first.sourceHash).not.toBe(second.sourceHash);
  });
});

describe("Googleスプレッドシート接続", () => {
  it("20列が一致するタブだけを候補にする", async () => {
    const userId = await integrationUser();
    const getValues = vi.fn().mockImplementation(({ range }: { range: string }) =>
      Promise.resolve({
        data: {
          values: range.includes("候補タブ")
            ? [[...GOOGLE_SHEET_HEADERS].slice(0, 20)]
            : [["別形式"]],
        },
      }),
    );
    vi.spyOn(google, "sheets").mockReturnValue({
      spreadsheets: {
        get: vi.fn().mockResolvedValue({
          data: {
            properties: { title: "既存ブック" },
            sheets: [
              { properties: { sheetId: 10, title: "候補タブ" } },
              { properties: { sheetId: 20, title: "他のタブ" } },
            ],
          },
        }),
        values: { get: getValues },
      },
    } as never);

    await expect(
      inspectGoogleSpreadsheet(userId, "spreadsheet-id"),
    ).resolves.toEqual({
      spreadsheetId: "spreadsheet-id",
      name: "既存ブック",
      candidates: [{ sheetId: 10, title: "候補タブ" }],
    });
    expect(getValues).toHaveBeenCalledTimes(2);
  });

  it("選択した管理タブだけへメタデータと書式を設定する", async () => {
    const userId = await integrationUser();
    const valuesUpdate = vi.fn().mockResolvedValue({ data: {} });
    const batchUpdate = vi.fn().mockResolvedValue({ data: { replies: [] } });
    const getValues = vi.fn().mockImplementation(({ range }: { range: string }) =>
      Promise.resolve({
        data: {
          values: range.includes("他のタブ")
            ? [["別形式"]]
            : [[...GOOGLE_SHEET_HEADERS].slice(0, 20)],
        },
      }),
    );
    vi.spyOn(google, "sheets").mockReturnValue({
      spreadsheets: {
        get: vi.fn().mockResolvedValue({
          data: {
            properties: { title: "既存ブック" },
            sheets: [
              {
                properties: { sheetId: 10, title: "候補タブ" },
                protectedRanges: [],
                developerMetadata: [],
              },
              { properties: { sheetId: 20, title: "他のタブ" } },
            ],
          },
        }),
        values: {
          get: getValues,
          update: valuesUpdate,
        },
        batchUpdate,
      },
    } as never);

    const result = await connectGoogleSpreadsheet(
      userId,
      "spreadsheet-id",
      10,
    );
    expect(result.selected).toEqual({ sheetId: 10, title: "候補タブ" });
    expect(valuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ range: "'候補タブ'!U1:V1" }),
    );
    const requests = batchUpdate.mock.calls[0]?.[0].requestBody.requests;
    expect(JSON.stringify(requests)).not.toContain('"sheetId":20');
    expect(
      getDb().sqlite
        .prepare(
          "SELECT spreadsheet_id, sheet_id, sheet_title FROM google_integrations WHERE user_id = ?",
        )
        .get(userId),
    ).toEqual({
      spreadsheet_id: "spreadsheet-id",
      sheet_id: 10,
      sheet_title: "候補タブ",
    });
  });

  it("新規ブックを作り、管理タブだけをRAW全件反映する", async () => {
    const userId = await integrationUser();
    createBook(bookInput);
    const valuesUpdate = vi.fn().mockResolvedValue({ data: {} });
    const valuesClear = vi.fn().mockResolvedValue({ data: {} });
    const formatUpdate = vi.fn().mockResolvedValue({ data: {} });
    vi.spyOn(google, "sheets").mockReturnValue({
      spreadsheets: {
        create: vi.fn().mockResolvedValue({
          data: {
            spreadsheetId: "new-spreadsheet",
            properties: { title: "ComicDB 蔵書" },
            sheets: [{ properties: { sheetId: 30, title: "ComicDB蔵書" } }],
          },
        }),
        get: vi.fn().mockResolvedValue({
          data: {
            properties: { title: "ComicDB 蔵書" },
            sheets: [
              {
                properties: { sheetId: 30, title: "ComicDB蔵書" },
                protectedRanges: [],
                developerMetadata: [],
              },
            ],
          },
        }),
        values: {
          update: valuesUpdate,
          clear: valuesClear,
        },
        batchUpdate: formatUpdate,
      },
    } as never);

    await createGoogleSpreadsheet(userId);
    expect(valuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: "new-spreadsheet",
        range: "'ComicDB蔵書'!A1",
        valueInputOption: "RAW",
      }),
    );
    const written = valuesUpdate.mock.calls[0]?.[0].requestBody.values;
    expect(written[0]).toEqual([...GOOGLE_SHEET_HEADERS]);
    expect(written[1][20]).toBeTruthy();
    expect(valuesClear).toHaveBeenCalledWith(
      expect.objectContaining({ range: "'ComicDB蔵書'!A3:V" }),
    );
    expect(JSON.stringify(formatUpdate.mock.calls[0]?.[0])).not.toContain(
      '"sheetId":20',
    );
  });
});

describe("Googleシート取込確定", () => {
  async function connectedUser(values: Array<Array<string | number | boolean>>) {
    const session = await createAdmin("owner", "a-very-long-password");
    const now = new Date().toISOString();
    getDb().sqlite
      .prepare(
        `INSERT INTO google_integrations
          (user_id, google_subject, google_email, encrypted_refresh_token,
           granted_scopes, spreadsheet_id, spreadsheet_name, sheet_id,
           sheet_title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        session.user.id,
        "google-subject",
        "owner@example.com",
        encryptGoogleRefreshToken("refresh-token"),
        "https://www.googleapis.com/auth/drive.file",
        "spreadsheet-id",
        "テスト",
        123,
        "ComicDB蔵書",
        now,
        now,
      );
    const batchUpdate = vi.fn().mockResolvedValue({ data: {} });
    vi.spyOn(google, "sheets").mockReturnValue({
      spreadsheets: {
        values: {
          get: vi.fn().mockResolvedValue({ data: { values } }),
          batchUpdate,
        },
      },
    } as never);
    return { userId: session.user.id, batchUpdate };
  }

  it("有効行だけをトランザクションで反映し、IDと更新日時を書き戻す", async () => {
    const values = [
      [...GOOGLE_SHEET_HEADERS],
      newSheetRow("新規取込"),
      newSheetRow("=FORMULA"),
    ];
    const { userId, batchUpdate } = await connectedUser(values);
    const preview = await previewGoogleSheetPull(userId);
    const result = await applyGoogleSheetPull(userId, preview.sourceHash);

    expect(result.created).toBe(1);
    expect(result.errors).toBe(1);
    expect(
      getDb().sqlite.prepare("SELECT COUNT(*) AS count FROM books").get(),
    ).toEqual({ count: 1 });
    const writeback = batchUpdate.mock.calls[0]?.[0].requestBody.data[0];
    expect(writeback.values[0][20]).toBeTruthy();
    expect(writeback.values[0][21]).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
  });

  it("ハッシュ不一致を409にしてDBを変更しない", async () => {
    const values = [[...GOOGLE_SHEET_HEADERS], newSheetRow("新規取込")];
    const { userId } = await connectedUser(values);
    await expect(applyGoogleSheetPull(userId, "different-hash")).rejects.toMatchObject({
      status: 409,
    });
    expect(
      getDb().sqlite.prepare("SELECT COUNT(*) AS count FROM books").get(),
    ).toEqual({ count: 0 });
  });

  it("既存行の購入列変更をDBへ入れず、正規値だけを書き戻す", async () => {
    const book = createBook(bookInput);
    const row = googleSheetRowForBook(book.id)!;
    row[13] = 9999;
    row[14] = 9;
    const values = [[...GOOGLE_SHEET_HEADERS], row];
    const { userId, batchUpdate } = await connectedUser(values);
    const preview = await previewGoogleSheetPull(userId);
    expect(preview.normalizationCount).toBe(1);

    const result = await applyGoogleSheetPull(userId, preview.sourceHash);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(getBook(book.id)?.acquisitions[0]?.priceYen).toBe(500);
    const writeback = batchUpdate.mock.calls[0]?.[0].requestBody.data[0];
    expect(writeback.values[0][13]).toBe(500);
    expect(writeback.values[0][14]).toBe(1);
  });

  it("書き戻し失敗後の再実行で二重登録せず回復する", async () => {
    const values = [[...GOOGLE_SHEET_HEADERS], newSheetRow("回復テスト")];
    const { userId, batchUpdate } = await connectedUser(values);
    batchUpdate
      .mockRejectedValueOnce(new Error("temporary Google API failure"))
      .mockResolvedValueOnce({ data: {} });
    const preview = await previewGoogleSheetPull(userId);

    await expect(
      applyGoogleSheetPull(userId, preview.sourceHash),
    ).rejects.toThrow("temporary");
    expect(
      getDb().sqlite.prepare("SELECT COUNT(*) AS count FROM books").get(),
    ).toEqual({ count: 1 });

    await expect(
      applyGoogleSheetPull(userId, preview.sourceHash),
    ).resolves.toMatchObject({ created: 1, recovered: true });
    expect(
      getDb().sqlite.prepare("SELECT COUNT(*) AS count FROM books").get(),
    ).toEqual({ count: 1 });
    expect(
      getDb().sqlite
        .prepare("SELECT value FROM app_settings WHERE key LIKE 'google_pull_pending:%'")
        .get(),
    ).toBeUndefined();
  });

  it("既存行の競合とエラーを変更しない", async () => {
    const book = createBook(bookInput);
    const row = googleSheetRowForBook(book.id)!;
    getDb().sqlite
      .prepare("UPDATE books SET updated_at = ? WHERE id = ?")
      .run("2030-01-01T00:00:00.000Z", book.id);
    row[0] = "競合タイトル";
    const values = [[...GOOGLE_SHEET_HEADERS], row, newSheetRow("=ERROR")];
    const { userId, batchUpdate } = await connectedUser(values);
    const preview = await previewGoogleSheetPull(userId);
    const result = await applyGoogleSheetPull(userId, preview.sourceHash);

    expect(result.conflicts).toBe(1);
    expect(result.errors).toBe(1);
    expect(getBook(book.id)?.title).toBe(bookInput.title);
    expect(batchUpdate).not.toHaveBeenCalled();
  });
});
