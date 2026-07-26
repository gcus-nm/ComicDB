import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbForTests } from "@/db";
import {
  addAcquisition,
  createBook,
  createEvent,
  createTaxonomyTag,
  createWishlistItem,
  deleteBook,
  deleteTaxonomyTag,
  deleteWishlistItem,
  findDuplicateCandidates,
  getBook,
  listBooks,
  listEvents,
  listTaxonomyTags,
  listWishlistItems,
  setBookOwnershipStatus,
  updateWishlistItem,
} from "@/lib/catalog";
import { exportCsv, importCsv, preflightCsv } from "@/lib/csv";
import { wishlistItemUpdateSchema } from "@/lib/validators";

let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "comicdb-test-"));
  process.env.DATA_DIR = tempDir;
});

afterEach(() => {
  closeDbForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("蔵書管理", () => {
  it("イベント購入、横断検索、重複候補、追加購入を扱う", () => {
    const event = createEvent({
      name: "コミックマーケット",
      startsOn: "2026-08-15",
      endsOn: "",
      venue: "東京",
      notes: "",
    })!;
    const book = createBook({
      title: "夏の記憶",
      circles: "星空書房",
      creators: "山田",
      fandoms: "作品A",
      characters: "主人公",
      pairings: "",
      genres: "漫画",
      tags: "新刊",
      adultRating: "general",
      publishedOn: "",
      edition: "",
      storageLocationId: null,
      storageLocation: "本棚A",
      readStatus: "unread",
      ownershipStatus: "owned",
      favorite: false,
      notes: "",
      eventId: event.id,
      purchasedOn: "",
      priceYen: 500,
      quantity: 1,
      acquisitionNotes: "",
    });

    expect(listBooks({ q: "星空" }).books[0]?.id).toBe(book.id);
    expect(listBooks({ q: "山田" }).books[0]?.id).toBe(book.id);
    expect(listBooks({ q: "作品A" }).books[0]?.id).toBe(book.id);
    expect(listBooks({ q: "主人公" }).books[0]?.id).toBe(book.id);
    expect(listBooks({ q: "新刊" }).books[0]?.id).toBe(book.id);
    expect(findDuplicateCandidates("夏の記憶", "星空書房")[0]?.id).toBe(book.id);
    expect(findDuplicateCandidates("", "")).toEqual([]);
    expect(addAcquisition(book.id, { eventId: event.id, quantity: 2 })?.ownedCount).toBe(3);

    expect(setBookOwnershipStatus(book.id, "disposed")?.ownershipStatus).toBe("disposed");
    expect(listBooks({ q: "夏の記憶" }).total).toBe(0);
    expect(listBooks({ q: "夏の記憶", ownershipStatus: "disposed" }).books[0]?.id).toBe(
      book.id,
    );
    expect(addAcquisition(book.id, { quantity: 1 })?.ownershipStatus).toBe("owned");
    expect(deleteBook(book.id)).toEqual([]);
    expect(getBook(book.id)).toBeNull();
    expect(listBooks({ q: "夏の記憶", ownershipStatus: "all" }).total).toBe(0);
  });

  it("CSVを出力して再取込できる", () => {
    createBook({
      title: "CSVテスト",
      circles: "表計算部",
      creators: "",
      fandoms: "作品Z",
      characters: "",
      pairings: "",
      genres: "",
      tags: "",
      adultRating: "general",
      publishedOn: "",
      edition: "",
      storageLocationId: null,
      storageLocation: "",
      readStatus: "unread",
      ownershipStatus: "disposed",
      favorite: false,
      notes: "",
      eventId: null,
      purchasedOn: "",
      priceYen: null,
      quantity: 1,
      acquisitionNotes: "",
    });
    const csv = exportCsv();
    expect(csv).toContain("作品");
    expect(csv).not.toContain("原作");
    const legacyPreview = preflightCsv(csv.replace("作品", "原作"));
    expect(legacyPreview[0]?.input.fandoms).toBe("作品Z");
    expect(legacyPreview[0]?.errors).toEqual([]);
    closeDbForTests();
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = mkdtempSync(path.join(os.tmpdir(), "comicdb-test-import-"));
    process.env.DATA_DIR = tempDir;
    expect(importCsv(csv).imported).toBe(1);
    expect(
      listBooks({ q: "CSVテスト", ownershipStatus: "disposed" }).books[0]
        ?.ownershipStatus,
    ).toBe("disposed");
  });

  it("分類マスターを事前登録し、未使用項目を削除できる", () => {
    const fandom = createTaxonomyTag("作品A", "fandom");
    const anotherFandom = createTaxonomyTag("作品B", "fandom");
    const character = createTaxonomyTag("主人公", "character", fandom.id);
    const sameNameCharacter = createTaxonomyTag(
      "主人公",
      "character",
      anotherFandom.id,
    );
    expect(character.id).not.toBe(sameNameCharacter.id);
    expect(character.parentId).toBe(fandom.id);
    deleteTaxonomyTag(character.id);
    expect(listTaxonomyTags().map((tag) => tag.id)).not.toContain(character.id);
  });

  it("イベントごとのほしいものを追加・更新・削除できる", () => {
    const event = createEvent({
      name: "コミックマーケット",
      startsOn: "2026-08-15",
      endsOn: "",
      venue: "東京ビッグサイト",
      notes: "",
    })!;
    const item = createWishlistItem(event.id, {
      title: "新刊セット",
      circle: "星空書房",
      booth: "東A-01a",
      quantity: 2,
      priceYen: 1000,
      notes: "会場限定",
      purchased: false,
    })!;
    expect(wishlistItemUpdateSchema.parse({ purchased: true })).toEqual({
      purchased: true,
    });

    expect(listWishlistItems(event.id)).toEqual([item]);
    expect(listEvents()[0]).toMatchObject({
      wishlistCount: 1,
      wishlistRemainingCount: 1,
    });

    const updated = updateWishlistItem(item.id, {
      purchased: true,
      quantity: 1,
    });
    expect(updated).toMatchObject({
      purchased: true,
      quantity: 1,
      circle: "星空書房",
      booth: "東A-01a",
      priceYen: 1000,
      notes: "会場限定",
    });
    expect(listEvents()[0]).toMatchObject({
      wishlistCount: 1,
      wishlistRemainingCount: 0,
    });

    expect(deleteWishlistItem(item.id)).toBe(true);
    expect(deleteWishlistItem(item.id)).toBe(false);
    expect(listWishlistItems(event.id)).toEqual([]);
  });
});
