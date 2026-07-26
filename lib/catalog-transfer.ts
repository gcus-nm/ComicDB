import { getDb } from "@/db";
import {
  createBook,
  createEvent,
  findDuplicateCandidates,
  getBook,
} from "./catalog";
import { bookInputSchema } from "./validators";

export const CATALOG_TRANSFER_HEADERS = [
  "タイトル",
  "サークル",
  "作者",
  "作品",
  "キャラクター",
  "カップリング",
  "ジャンル",
  "タグ",
  "成人区分",
  "発行日",
  "版",
  "イベント名",
  "イベント日",
  "購入価格",
  "数量",
  "保管場所",
  "所持状態",
  "読了状態",
  "お気に入り",
  "メモ",
] as const;

export type CatalogTransferCell = string | number;
export type RawCatalogRow = Record<string, string>;

export type CatalogSourceRow = {
  rowNumber: number;
  raw: RawCatalogRow;
};

export type CatalogPreviewRow = {
  rowNumber: number;
  raw: RawCatalogRow;
  input: ReturnType<typeof toBookInput>;
  errors: string[];
  duplicateCount: number;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: string) {
  if (!value) return null;
  const parsed = Number(value.replace(/[,\s￥¥円]/gu, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function toBookInput(row: RawCatalogRow) {
  const adult = clean(row["成人区分"]).toLocaleLowerCase();
  const read = clean(row["読了状態"]);
  const ownership = clean(row["所持状態"]);
  const favorite = /^(1|true|yes|はい|★)$/iu.test(clean(row["お気に入り"]));
  return {
    title: clean(row["タイトル"]),
    circles: clean(row["サークル"]),
    creators: clean(row["作者"]),
    fandoms: clean(row["作品"]) || clean(row["原作"]),
    characters: clean(row["キャラクター"]),
    pairings: clean(row["カップリング"]),
    genres: clean(row["ジャンル"]),
    tags: clean(row["タグ"]),
    adultRating: adult === "r18" || adult === "成人向け" ? ("r18" as const) : ("general" as const),
    publishedOn: clean(row["発行日"]),
    edition: clean(row["版"]),
    storageLocation: clean(row["保管場所"]),
    ownershipStatus:
      ownership === "処分済み" || ownership === "disposed"
        ? ("disposed" as const)
        : ("owned" as const),
    readStatus:
      read === "読了" || read === "read"
        ? ("read" as const)
        : read === "読書中" || read === "reading"
          ? ("reading" as const)
          : ("unread" as const),
    favorite,
    notes: clean(row["メモ"]),
    purchasedOn: clean(row["イベント日"]),
    priceYen: toNumber(clean(row["購入価格"])),
    quantity: toNumber(clean(row["数量"])) ?? 1,
    acquisitionNotes: "",
    eventId: null,
    eventName: clean(row["イベント名"]),
  };
}

export function preflightCatalogRows(rows: CatalogSourceRow[]): CatalogPreviewRow[] {
  if (rows.length > 5000) {
    throw new Error("一度に取り込めるのは5,000行までです。");
  }
  return rows.map(({ rowNumber, raw }) => {
    const input = toBookInput(raw);
    const result = bookInputSchema.safeParse(input);
    const errors = result.success
      ? []
      : result.error.issues.map((issue) => issue.message);
    return {
      rowNumber,
      raw,
      input,
      errors,
      duplicateCount: input.title
        ? findDuplicateCandidates(input.title, input.circles).length
        : 0,
    };
  });
}

export function findOrCreateEvent(name: string, startsOn: string) {
  if (!name || !startsOn) return null;
  const row = getDb().sqlite
    .prepare("SELECT id FROM events WHERE name = ? AND starts_on = ?")
    .get(name, startsOn) as { id: string } | undefined;
  if (row) return row.id;
  return createEvent({
    name,
    startsOn,
    endsOn: "",
    venue: "",
    notes: "",
  })?.id;
}

export function importCatalogRows(rows: CatalogSourceRow[]) {
  const preview = preflightCatalogRows(rows);
  const invalid = preview.filter((row) => row.errors.length);
  if (invalid.length) {
    throw new Error(`${invalid.length}行に入力エラーがあります。`);
  }
  const ids: string[] = [];
  for (const row of preview) {
    const eventId = findOrCreateEvent(row.input.eventName, row.input.purchasedOn);
    const result = bookInputSchema.parse({ ...row.input, eventId });
    ids.push(createBook(result).id);
  }
  return { imported: ids.length, ids };
}

export function exportCatalogRows(): CatalogTransferCell[][] {
  const ids = getDb().sqlite
    .prepare("SELECT id FROM books ORDER BY updated_at DESC")
    .all() as Array<{ id: string }>;
  return ids.map(({ id }) => {
    const book = getBook(id)!;
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
      book.ownedCount,
      book.storageLocation ?? "",
      book.ownershipStatus === "disposed" ? "処分済み" : "所持中",
      book.readStatus === "read"
        ? "読了"
        : book.readStatus === "reading"
          ? "読書中"
          : "未読",
      book.favorite ? "はい" : "",
      book.notes,
    ];
  });
}
