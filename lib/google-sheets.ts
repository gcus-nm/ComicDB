import { createHash } from "node:crypto";
import { google, sheets_v4 } from "googleapis";
import { getDb } from "@/db";
import {
  CATALOG_TRANSFER_HEADERS,
  RawCatalogRow,
  findOrCreateEvent,
  toBookInput,
} from "./catalog-transfer";
import {
  createBook,
  findDuplicateCandidates,
  getBook,
  updateBook,
} from "./catalog";
import {
  authorizedGoogleClient,
  getGoogleIntegration,
} from "./google-auth";
import { HttpError } from "./security";
import { bookInputSchema } from "./validators";

export const GOOGLE_SHEET_SCHEMA_VERSION = "1";
export const GOOGLE_METADATA_HEADERS = [
  "ComicDB ID",
  "基準更新日時",
] as const;
export const GOOGLE_SHEET_HEADERS = [
  ...CATALOG_TRANSFER_HEADERS,
  ...GOOGLE_METADATA_HEADERS,
] as const;
export const GOOGLE_SHEET_MAX_ROWS = 5000;

const PURCHASE_COLUMN_INDEXES = new Set([11, 12, 13, 14]);
const METADATA_KEY = "comicdb_schema_version";
const MANAGED_SHEET_TITLE = "ComicDB蔵書";

type SheetCell = string | number | boolean | null;
type SheetRow = SheetCell[];
export type GoogleSheetRowStatus =
  | "new"
  | "update"
  | "unchanged"
  | "conflict"
  | "error";

export type GoogleSheetPreviewRow = {
  rowNumber: number;
  status: GoogleSheetRowStatus;
  comicDbId: string | null;
  title: string;
  errors: string[];
  warnings: string[];
  duplicateCount: number;
};

type ClassifiedRow = GoogleSheetPreviewRow & {
  input: ReturnType<typeof toBookInput>;
  raw: RawCatalogRow;
  needsPurchaseWriteback: boolean;
};

export type GoogleSheetPreview = {
  sourceHash: string;
  rows: GoogleSheetPreviewRow[];
  counts: Record<GoogleSheetRowStatus, number>;
  warningCount: number;
  normalizationCount: number;
};

function cleanCell(value: SheetCell | undefined) {
  return String(value ?? "").trim();
}

function quoteSheetTitle(title: string) {
  return `'${title.replaceAll("'", "''")}'`;
}

function padRow(row: SheetRow, length = GOOGLE_SHEET_HEADERS.length) {
  return Array.from({ length }, (_, index) => row[index] ?? "");
}

function normalizedCell(value: SheetCell | undefined) {
  return cleanCell(value).replace(/\r\n?/gu, "\n");
}

function rowsEqual(left: SheetRow, right: SheetRow, indexes: number[]) {
  return indexes.every(
    (index) => normalizedCell(left[index]) === normalizedCell(right[index]),
  );
}

function rawFromVisibleRow(row: SheetRow) {
  return Object.fromEntries(
    CATALOG_TRANSFER_HEADERS.map((header, index) => [
      header,
      cleanCell(row[index]),
    ]),
  ) as RawCatalogRow;
}

function currentBookRow(bookId: string): SheetRow | null {
  const book = getBook(bookId);
  if (!book) return null;
  const latest = book.acquisitions[0];
  const byType = (type: string) =>
    book.tags
      .filter((tag) => tag.type === type)
      .map((tag) => tag.name)
      .join("、");
  return [
    book.title,
    book.circles.join("、"),
    book.creators.join("、"),
    byType("fandom"),
    byType("character"),
    byType("pairing"),
    byType("genre"),
    byType("custom"),
    book.adultRating === "r18" ? "R18" : "全年齢",
    book.publishedOn ?? "",
    book.edition,
    latest?.eventName ?? "",
    latest?.purchasedOn ?? "",
    latest?.priceYen ?? "",
    latest?.quantity ?? 1,
    book.storageLocation ?? "",
    book.ownershipStatus === "disposed" ? "処分済み" : "所持中",
    book.readStatus === "read"
      ? "読了"
      : book.readStatus === "reading"
        ? "読書中"
        : "未読",
    book.favorite ? "はい" : "",
    book.notes,
    book.id,
    book.updatedAt,
  ];
}

export function googleSheetRowForBook(bookId: string) {
  return currentBookRow(bookId);
}

function allBookRows() {
  const ids = getDb().sqlite
    .prepare("SELECT id FROM books ORDER BY updated_at DESC")
    .all() as Array<{ id: string }>;
  return ids
    .map(({ id }) => currentBookRow(id))
    .filter((row): row is SheetRow => Boolean(row));
}

function sheetHash(rows: SheetRow[]) {
  const canonical = rows.map((row) =>
    padRow(row).map((cell) =>
      typeof cell === "string" ? cell.replace(/\r\n?/gu, "\n") : cell,
    ),
  );
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function hasFormula(row: SheetRow) {
  return row.some(
    (cell) => typeof cell === "string" && cell.trimStart().startsWith("="),
  );
}

function previewCounts(rows: GoogleSheetPreviewRow[]) {
  const counts: Record<GoogleSheetRowStatus, number> = {
    new: 0,
    update: 0,
    unchanged: 0,
    conflict: 0,
    error: 0,
  };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

export function classifyGoogleSheetValues(
  values: SheetRow[],
): GoogleSheetPreview & { classifiedRows: ClassifiedRow[] } {
  if (values.length === 0) {
    throw new HttpError(400, "管理タブにヘッダー行がありません。");
  }
  if (values.length - 1 > GOOGLE_SHEET_MAX_ROWS) {
    throw new HttpError(
      413,
      `Googleシートから取り込めるのは${GOOGLE_SHEET_MAX_ROWS.toLocaleString()}行までです。`,
    );
  }
  const header = padRow(values[0]);
  const compatible = CATALOG_TRANSFER_HEADERS.every(
    (name, index) => cleanCell(header[index]) === name,
  );
  if (!compatible) {
    throw new HttpError(400, "管理タブの20列ヘッダーがComicDB形式と一致しません。");
  }

  const dataRows = values.slice(1).map((row) => padRow(row));
  const idCounts = new Map<string, number>();
  for (const row of dataRows) {
    const id = cleanCell(row[20]);
    if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }

  const editableIndexes = Array.from(
    { length: CATALOG_TRANSFER_HEADERS.length },
    (_, index) => index,
  ).filter((index) => !PURCHASE_COLUMN_INDEXES.has(index));
  const purchaseIndexes = [...PURCHASE_COLUMN_INDEXES];
  const classifiedRows: ClassifiedRow[] = [];

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (row.every((cell) => !cleanCell(cell))) return;
    const id = cleanCell(row[20]) || null;
    const baseline = cleanCell(row[21]);
    const raw = rawFromVisibleRow(row);
    const errors: string[] = [];
    const warnings: string[] = [];
    let status: GoogleSheetRowStatus = "unchanged";
    let needsPurchaseWriteback = false;
    let effectiveRaw = raw;
    let current: SheetRow | null = null;

    if (hasFormula(row)) errors.push("式セルは取り込めません。値へ置き換えてください。");
    if (id && (idCounts.get(id) ?? 0) > 1) {
      errors.push("同じComicDB IDがシート内で重複しています。");
    }
    if (id && (!baseline || Number.isNaN(Date.parse(baseline)))) {
      errors.push("基準更新日時がないか、形式が不正です。");
    }

    if (id) {
      current = currentBookRow(id);
      if (!current) {
        errors.push("ComicDB IDに対応する蔵書が見つかりません。");
      } else {
        const canonicalVisible = current.slice(
          0,
          CATALOG_TRANSFER_HEADERS.length,
        );
        const visible = row.slice(0, CATALOG_TRANSFER_HEADERS.length);
        const purchaseChanged = !rowsEqual(
          visible,
          canonicalVisible,
          purchaseIndexes,
        );
        if (purchaseChanged) {
          warnings.push(
            "既存蔵書の購入情報は参照専用です。変更は無視して正規値へ戻します。",
          );
          needsPurchaseWriteback = true;
          const effective = [...visible];
          for (const purchaseIndex of purchaseIndexes) {
            effective[purchaseIndex] = canonicalVisible[purchaseIndex] ?? "";
          }
          effectiveRaw = rawFromVisibleRow(effective);
        }
        const editableChanged = !rowsEqual(
          visible,
          canonicalVisible,
          editableIndexes,
        );
        const visibleChanged = !rowsEqual(
          visible,
          canonicalVisible,
          Array.from(
            { length: CATALOG_TRANSFER_HEADERS.length },
            (_, columnIndex) => columnIndex,
          ),
        );
        if (visibleChanged && baseline !== cleanCell(current[21])) {
          status = "conflict";
          warnings.push(
            "シート反映後にComicDB側も更新されています。競合のため保留します。",
          );
        } else if (editableChanged) {
          status = "update";
        }
      }
    } else {
      status = "new";
      if (baseline) errors.push("ComicDB IDが空なのに基準更新日時があります。");
    }

    const input = toBookInput(effectiveRaw);
    const validation = bookInputSchema.safeParse(input);
    if (!validation.success) {
      errors.push(...validation.error.issues.map((issue) => issue.message));
    }
    if (errors.length) status = "error";
    const duplicateCount = input.title
      ? findDuplicateCandidates(input.title, input.circles).filter(
          (candidate) => candidate.id !== id,
        ).length
      : 0;
    if (duplicateCount) {
      warnings.push(`重複候補が${duplicateCount}件あります。`);
    }
    classifiedRows.push({
      rowNumber,
      status,
      comicDbId: id,
      title: input.title,
      errors,
      warnings,
      duplicateCount,
      input,
      raw: effectiveRaw,
      needsPurchaseWriteback,
    });
  });

  const rows = classifiedRows.map((row) => ({
    rowNumber: row.rowNumber,
    status: row.status,
    comicDbId: row.comicDbId,
    title: row.title,
    errors: row.errors,
    warnings: row.warnings,
    duplicateCount: row.duplicateCount,
  }));
  return {
    sourceHash: sheetHash(values),
    rows,
    classifiedRows,
    counts: previewCounts(rows),
    warningCount: rows.filter((row) => row.warnings.length).length,
    normalizationCount: classifiedRows.filter(
      (row) =>
        row.status === "unchanged" && row.needsPurchaseWriteback,
    ).length,
  };
}

function sheetsApi(userId: string) {
  const { client, integration } = authorizedGoogleClient(userId);
  return {
    sheets: google.sheets({ version: "v4", auth: client }),
    integration,
  };
}

async function spreadsheetDetails(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
) {
  try {
    return await sheets.spreadsheets.get({
      spreadsheetId,
      fields:
        "spreadsheetId,properties.title,sheets(properties(sheetId,title,gridProperties),protectedRanges(protectedRangeId,description),developerMetadata(metadataId,metadataKey))",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|requested entity was not found/iu.test(message)) {
      throw new HttpError(
        404,
        "スプレッドシートが見つからないか、ComicDBへアクセスが許可されていません。",
      );
    }
    throw error;
  }
}

async function headerValues(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  title: string,
) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoteSheetTitle(title)}!1:1`,
    valueRenderOption: "FORMULA",
  });
  return (response.data.values?.[0] ?? []) as SheetRow;
}

export async function inspectGoogleSpreadsheet(
  userId: string,
  spreadsheetId: string,
) {
  if (!/^[a-zA-Z0-9_-]{10,}$/u.test(spreadsheetId)) {
    throw new HttpError(400, "スプレッドシートIDが不正です。");
  }
  const { sheets } = sheetsApi(userId);
  const details = await spreadsheetDetails(sheets, spreadsheetId);
  const candidates: Array<{ sheetId: number; title: string }> = [];
  for (const item of details.data.sheets ?? []) {
    const sheetId = item.properties?.sheetId;
    const title = item.properties?.title;
    if (sheetId == null || !title) continue;
    const header = await headerValues(sheets, spreadsheetId, title);
    if (
      CATALOG_TRANSFER_HEADERS.every(
        (name, index) => cleanCell(header[index]) === name,
      )
    ) {
      candidates.push({ sheetId, title });
    }
  }
  return {
    spreadsheetId,
    name: details.data.properties?.title ?? "Googleスプレッドシート",
    candidates,
  };
}

function connectionUpdate(
  userId: string,
  spreadsheetId: string,
  spreadsheetName: string,
  sheetId: number,
  sheetTitle: string,
) {
  const now = new Date().toISOString();
  const result = getDb().sqlite
    .prepare(
      `UPDATE google_integrations SET
         spreadsheet_id = ?, spreadsheet_name = ?, sheet_id = ?,
         sheet_title = ?, updated_at = ?
       WHERE user_id = ?`,
    )
    .run(spreadsheetId, spreadsheetName, sheetId, sheetTitle, now, userId);
  if (!result.changes) {
    throw new HttpError(409, "Googleアカウントが接続されていません。");
  }
}

async function managedSheetCleanupRequests(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number,
) {
  const details = await spreadsheetDetails(sheets, spreadsheetId);
  const sheet = details.data.sheets?.find(
    (item) => item.properties?.sheetId === sheetId,
  );
  const requests: sheets_v4.Schema$Request[] = [];
  for (const range of sheet?.protectedRanges ?? []) {
    if (
      range.protectedRangeId !== undefined &&
      range.description?.startsWith("ComicDB")
    ) {
      requests.push({
        deleteProtectedRange: { protectedRangeId: range.protectedRangeId },
      });
    }
  }
  for (const metadata of sheet?.developerMetadata ?? []) {
    if (
      metadata.metadataId !== undefined &&
      metadata.metadataKey === METADATA_KEY
    ) {
      requests.push({
        deleteDeveloperMetadata: {
          dataFilter: {
            developerMetadataLookup: { metadataId: metadata.metadataId },
          },
        },
      });
    }
  }
  return requests;
}

async function formatManagedSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number,
  lastExistingRow: number,
) {
  const cleanup = await managedSheetCleanupRequests(
    sheets,
    spreadsheetId,
    sheetId,
  );
  const validation = (
    columnIndex: number,
    values: string[],
  ): sheets_v4.Schema$Request => ({
    setDataValidation: {
      range: {
        sheetId,
        startRowIndex: 1,
        startColumnIndex: columnIndex,
        endColumnIndex: columnIndex + 1,
      },
      rule: {
        condition: {
          type: "ONE_OF_LIST",
          values: values.map((userEnteredValue) => ({ userEnteredValue })),
        },
        strict: true,
        showCustomUi: true,
      },
    },
  });
  const requests: sheets_v4.Schema$Request[] = [
    ...cleanup,
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    },
    {
      setBasicFilter: {
        filter: {
          range: {
            sheetId,
            startRowIndex: 0,
            startColumnIndex: 0,
            endColumnIndex: GOOGLE_SHEET_HEADERS.length,
          },
        },
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: GOOGLE_SHEET_HEADERS.length,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.18, green: 0.23, blue: 0.31 },
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              bold: true,
            },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
    {
      updateCells: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: GOOGLE_SHEET_HEADERS.length,
        },
        rows: [
          {
            values: GOOGLE_SHEET_HEADERS.map((header, index) => ({
              note:
                index >= 20
                  ? `${header}はComicDBが同期判定に使用します。編集しないでください。`
                  : PURCHASE_COLUMN_INDEXES.has(index)
                    ? `${header}は既存行では参照専用です。新規行では初回購入情報として使用します。`
                    : `${header}（ComicDB Google連携 schema v${GOOGLE_SHEET_SCHEMA_VERSION}）`,
            })),
          },
        ],
        fields: "note",
      },
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: 20,
          endIndex: 22,
        },
        properties: { hiddenByUser: true },
        fields: "hiddenByUser",
      },
    },
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: 20,
        },
      },
    },
    ...[9, 12].map(
      (columnIndex) =>
        ({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              startColumnIndex: columnIndex,
              endColumnIndex: columnIndex + 1,
            },
            cell: {
              userEnteredFormat: {
                numberFormat: { type: "TEXT", pattern: "@" },
              },
            },
            fields: "userEnteredFormat.numberFormat",
          },
        }) satisfies sheets_v4.Schema$Request,
    ),
    validation(8, ["全年齢", "R18"]),
    validation(16, ["所持中", "処分済み"]),
    validation(17, ["未読", "読書中", "読了"]),
    validation(18, ["", "はい"]),
    {
      addProtectedRange: {
        protectedRange: {
          description: "ComicDB 同期管理列",
          range: {
            sheetId,
            startColumnIndex: 20,
            endColumnIndex: 22,
          },
          warningOnly: false,
        },
      },
    },
    ...(lastExistingRow >= 2
      ? [
          {
            addProtectedRange: {
              protectedRange: {
                description: "ComicDB 既存行の購入情報",
                range: {
                  sheetId,
                  startRowIndex: 1,
                  endRowIndex: lastExistingRow,
                  startColumnIndex: 11,
                  endColumnIndex: 15,
                },
                warningOnly: false,
              },
            },
          } satisfies sheets_v4.Schema$Request,
        ]
      : []),
    {
      createDeveloperMetadata: {
        developerMetadata: {
          metadataKey: METADATA_KEY,
          metadataValue: GOOGLE_SHEET_SCHEMA_VERSION,
          visibility: "DOCUMENT",
          location: { sheetId },
        },
      },
    },
  ];
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
}

async function ensureMetadataHeaders(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetTitle: string,
) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheetTitle(sheetTitle)}!U1:V1`,
    valueInputOption: "RAW",
    requestBody: { values: [[...GOOGLE_METADATA_HEADERS]] },
  });
}

async function managedSheetValues(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetTitle: string,
) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoteSheetTitle(sheetTitle)}!A1:V${
      GOOGLE_SHEET_MAX_ROWS + 2
    }`,
    valueRenderOption: "FORMULA",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  return (response.data.values ?? []) as SheetRow[];
}

function lastExistingSheetRow(values: SheetRow[]) {
  let last = 1;
  values.forEach((row, index) => {
    if (index > 0 && cleanCell(row[20])) last = index + 1;
  });
  return last;
}

export async function connectGoogleSpreadsheet(
  userId: string,
  spreadsheetId: string,
  requestedSheetId?: number,
) {
  assertNoPendingPull(userId);
  const inspected = await inspectGoogleSpreadsheet(userId, spreadsheetId);
  const { sheets } = sheetsApi(userId);
  let selected: { sheetId: number; title: string } | undefined =
    requestedSheetId === undefined
      ? inspected.candidates.length === 1
        ? inspected.candidates[0]
        : undefined
      : inspected.candidates.find(
          (candidate) => candidate.sheetId === requestedSheetId,
        );
  let created = false;
  if (!selected && inspected.candidates.length > 1 && requestedSheetId === undefined) {
    throw new HttpError(409, "管理対象にするタブを選択してください。");
  }
  if (!selected && requestedSheetId !== undefined) {
    throw new HttpError(400, "選択したタブはComicDBの20列形式と一致しません。");
  }
  if (!selected) {
    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: MANAGED_SHEET_TITLE },
            },
          },
        ],
      },
    });
    const properties = response.data.replies?.[0]?.addSheet?.properties;
    if (properties?.sheetId == null || !properties.title) {
      throw new Error("管理タブを作成できませんでした。");
    }
    selected = { sheetId: properties.sheetId, title: properties.title };
    created = true;
  }
  if (!selected) {
    throw new Error("管理タブを決定できませんでした。");
  }
  connectionUpdate(
    userId,
    spreadsheetId,
    inspected.name,
    selected.sheetId,
    selected.title,
  );
  if (created) {
    await replaceManagedSheet(userId);
  } else {
    await ensureMetadataHeaders(sheets, spreadsheetId, selected.title);
    const values = await managedSheetValues(sheets, spreadsheetId, selected.title);
    await formatManagedSheet(
      sheets,
      spreadsheetId,
      selected.sheetId,
      lastExistingSheetRow(values),
    );
  }
  return { ...inspected, selected, created };
}

export async function createGoogleSpreadsheet(userId: string) {
  assertNoPendingPull(userId);
  const { sheets } = sheetsApi(userId);
  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: "ComicDB 蔵書" },
      sheets: [{ properties: { title: MANAGED_SHEET_TITLE } }],
    },
    fields: "spreadsheetId,properties.title,sheets.properties(sheetId,title)",
  });
  const spreadsheetId = response.data.spreadsheetId;
  const sheet = response.data.sheets?.[0]?.properties;
  if (
    !spreadsheetId ||
    sheet?.sheetId == null ||
    !sheet.title
  ) {
    throw new Error("Googleスプレッドシートを作成できませんでした。");
  }
  connectionUpdate(
    userId,
    spreadsheetId,
    response.data.properties?.title ?? "ComicDB 蔵書",
    sheet.sheetId,
    sheet.title,
  );
  await replaceManagedSheet(userId);
  return {
    spreadsheetId,
    name: response.data.properties?.title ?? "ComicDB 蔵書",
    sheetId: sheet.sheetId,
    sheetTitle: sheet.title,
  };
}

async function readManagedSheet(userId: string) {
  const { sheets, integration } = sheetsApi(userId);
  if (
    !integration.spreadsheet_id ||
    integration.sheet_id === null ||
    !integration.sheet_title
  ) {
    throw new HttpError(409, "管理対象のGoogleスプレッドシートを選択してください。");
  }
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: integration.spreadsheet_id,
    range: `${quoteSheetTitle(integration.sheet_title)}!A1:V${
      GOOGLE_SHEET_MAX_ROWS + 2
    }`,
    valueRenderOption: "FORMULA",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  return {
    sheets,
    integration,
    values: (response.data.values ?? []) as SheetRow[],
  };
}

export async function previewGoogleSheetPull(
  userId: string,
): Promise<GoogleSheetPreview> {
  const { values } = await readManagedSheet(userId);
  const result = classifyGoogleSheetValues(values);
  return {
    sourceHash: result.sourceHash,
    rows: result.rows,
    counts: result.counts,
    warningCount: result.warningCount,
    normalizationCount: result.normalizationCount,
  };
}

async function writeRowsBack(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetTitle: string,
  rows: Array<{ rowNumber: number; values: SheetRow }>,
) {
  if (!rows.length) return;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: rows.map((row) => ({
        range: `${quoteSheetTitle(sheetTitle)}!A${row.rowNumber}:V${row.rowNumber}`,
        values: [row.values],
      })),
    },
  });
}

type PendingPull = {
  sourceHash: string;
  spreadsheetId: string;
  sheetTitle: string;
  rows: Array<{ rowNumber: number; values: SheetRow }>;
  result: {
    applied: number;
    created: number;
    updated: number;
    conflicts: number;
    errors: number;
  };
};

function pendingPullKey(userId: string) {
  return `google_pull_pending:${userId}`;
}

function assertNoPendingPull(userId: string) {
  if (readPendingPull(userId)) {
    throw new HttpError(
      409,
      "前回の取込後のシート書き戻しが未完了です。先に同じ管理タブで取込を再実行してください。",
    );
  }
}

function readPendingPull(userId: string) {
  const row = getDb().sqlite
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(pendingPullKey(userId)) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as PendingPull) : null;
}

function finishPendingPull(userId: string) {
  const now = new Date().toISOString();
  getDb().sqlite.transaction(() => {
    getDb().sqlite
      .prepare("DELETE FROM app_settings WHERE key = ?")
      .run(pendingPullKey(userId));
    getDb().sqlite
      .prepare(
        "UPDATE google_integrations SET last_pull_at = ?, updated_at = ? WHERE user_id = ?",
      )
      .run(now, now, userId);
  })();
}

export async function applyGoogleSheetPull(userId: string, expectedHash: string) {
  const { sheets, integration, values } = await readManagedSheet(userId);
  const currentHash = sheetHash(values);
  const pendingPull = readPendingPull(userId);
  if (pendingPull) {
    if (
      !expectedHash ||
      pendingPull.sourceHash !== expectedHash ||
      currentHash !== expectedHash ||
      pendingPull.spreadsheetId !== integration.spreadsheet_id ||
      pendingPull.sheetTitle !== integration.sheet_title
    ) {
      throw new HttpError(
        409,
        "前回の取込はDBへ反映済みですが、シートへの書き戻しが未完了です。管理タブを変更せず再確認・再実行してください。",
      );
    }
    await writeRowsBack(
      sheets,
      pendingPull.spreadsheetId,
      pendingPull.sheetTitle,
      pendingPull.rows,
    );
    finishPendingPull(userId);
    return { ...pendingPull.result, recovered: true };
  }
  const preview = classifyGoogleSheetValues(values);
  if (!expectedHash || preview.sourceHash !== expectedHash) {
    throw new HttpError(
      409,
      "事前確認後にGoogleシートが変更されました。もう一度確認してください。",
    );
  }
  const applied: Array<{ rowNumber: number; values: SheetRow }> = [];
  const result = {
    applied: 0,
    created: preview.counts.new,
    updated: preview.counts.update,
    conflicts: preview.counts.conflict,
    errors: preview.counts.error,
  };
  const transaction = getDb().sqlite.transaction(() => {
    for (const row of preview.classifiedRows) {
      if (row.status === "new") {
        const eventId = findOrCreateEvent(
          row.input.eventName,
          row.input.purchasedOn,
        );
        const created = createBook(
          bookInputSchema.parse({ ...row.input, eventId }),
        );
        applied.push({
          rowNumber: row.rowNumber,
          values: currentBookRow(created.id)!,
        });
      } else if (row.status === "update" && row.comicDbId) {
        const updated = updateBook(
          row.comicDbId,
          bookInputSchema.parse(row.input),
        );
        if (updated) {
          applied.push({
            rowNumber: row.rowNumber,
            values: currentBookRow(updated.id)!,
          });
        }
      } else if (
        row.status === "unchanged" &&
        row.needsPurchaseWriteback &&
        row.comicDbId
      ) {
        const canonical = currentBookRow(row.comicDbId);
        if (canonical) {
          applied.push({ rowNumber: row.rowNumber, values: canonical });
        }
      }
    }
    result.applied = preview.counts.new + preview.counts.update;
    const pending: PendingPull = {
      sourceHash: preview.sourceHash,
      spreadsheetId: integration.spreadsheet_id!,
      sheetTitle: integration.sheet_title!,
      rows: applied,
      result,
    };
    const now = new Date().toISOString();
    getDb().sqlite
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(pendingPullKey(userId), JSON.stringify(pending), now);
  });
  transaction();
  await writeRowsBack(
    sheets,
    integration.spreadsheet_id!,
    integration.sheet_title!,
    applied,
  );
  finishPendingPull(userId);
  return result;
}

export async function previewGoogleSheetPush(userId: string) {
  return previewGoogleSheetPull(userId);
}

async function replaceManagedSheet(userId: string) {
  const { sheets, integration } = sheetsApi(userId);
  if (
    !integration.spreadsheet_id ||
    integration.sheet_id === null ||
    !integration.sheet_title
  ) {
    throw new HttpError(409, "管理対象のGoogleスプレッドシートを選択してください。");
  }
  const rows = allBookRows();
  await sheets.spreadsheets.values.update({
    spreadsheetId: integration.spreadsheet_id,
    range: `${quoteSheetTitle(integration.sheet_title)}!A1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[...GOOGLE_SHEET_HEADERS], ...rows],
    },
  });
  await sheets.spreadsheets.values.clear({
    spreadsheetId: integration.spreadsheet_id,
    range: `${quoteSheetTitle(integration.sheet_title)}!A${rows.length + 2}:V`,
  });
  await formatManagedSheet(
    sheets,
    integration.spreadsheet_id,
    integration.sheet_id,
    rows.length + 1,
  );
  const now = new Date().toISOString();
  getDb().sqlite
    .prepare(
      "UPDATE google_integrations SET last_push_at = ?, updated_at = ? WHERE user_id = ?",
    )
    .run(now, now, userId);
  return { exported: rows.length };
}

export async function applyGoogleSheetPush(
  userId: string,
  expectedHash: string,
  force: boolean,
) {
  const preview = await previewGoogleSheetPush(userId);
  if (!expectedHash || preview.sourceHash !== expectedHash) {
    throw new HttpError(
      409,
      "事前確認後にGoogleシートが変更されました。もう一度確認してください。",
    );
  }
  const pending =
    preview.rows.filter(
      (row) => row.status !== "unchanged" || row.warnings.length > 0,
    ).length;
  if (pending && !force) {
    throw new HttpError(
      409,
      `未取込の変更・警告が${pending}件あります。上書きを明示的に確認してください。`,
    );
  }
  return replaceManagedSheet(userId);
}

export function googleSheetConnection(userId: string) {
  const integration = getGoogleIntegration(userId);
  if (!integration?.spreadsheet_id || integration.sheet_id === null) return null;
  return integration;
}
