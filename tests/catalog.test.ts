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
  getEvent,
  hasWishlistItemsOutsideEventRange,
  listBooks,
  listEvents,
  listTaxonomyTags,
  listWishlistItems,
  setBookOwnershipStatus,
  updateEvent,
  updateWishlistItem,
} from "@/lib/catalog";
import { exportCsv, importCsv, preflightCsv } from "@/lib/csv";
import {
  eventInputSchema,
  wishlistItemInputSchema,
  wishlistItemUpdateSchema,
} from "@/lib/validators";

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
      links: ["https://example.com/books/summer"],
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
    expect(getBook(book.id)?.links).toEqual(["https://example.com/books/summer"]);
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
    const event = createEvent(eventInputSchema.parse({
      name: "コミックマーケット",
      startsOn: "2026-08-15",
      endsOn: "2026-08-17",
      venue: "東京ビッグサイト",
      notes: "",
    }))!;
    const fandom = createTaxonomyTag("作品A", "fandom");
    const character = createTaxonomyTag("主人公", "character", fandom.id);
    const pairing = createTaxonomyTag("主人公×相棒", "pairing", fandom.id);

    const item = createWishlistItem(event.id, {
      eventDay: 2,
      title: "新刊セット",
      circle: "星空書房",
      creators: "山田、佐藤",
      fandomTagIds: [fandom.id],
      characterTagIds: [character.id],
      pairingTagIds: [pairing.id],
      genres: "漫画",
      tags: "新刊、会場限定",
      adultRating: "r18",
      publishedOn: "2026-08-10",
      edition: "初版",
      booth: "東A-01a",
      quantity: 2,
      priceYen: 1000,
      notes: "会場限定",
      links: "[告知ポスト](https://twitter.com/example/status/1)\n\nhttps://example.com/catalog",
      purchased: false,
    }, {
      coverPath: "media/covers/wishlist.webp",
      thumbnailPath: "media/thumbs/wishlist.webp",
    })!;
    expect(
      wishlistItemUpdateSchema.parse({ eventDay: 3, purchased: true }),
    ).toEqual({ eventDay: 3, purchased: true });

    expect(listWishlistItems(event.id)).toEqual([item]);
    expect(listTaxonomyTags().find((tag) => tag.id === fandom.id)?.usageCount).toBe(1);
    expect(() => deleteTaxonomyTag(character.id)).toThrow(
      "蔵書またはほしいものリストで使用中",
    );
    expect(listEvents()[0]).toMatchObject({
      wishlistCount: 1,
      wishlistRemainingCount: 1,
    });

    const updated = updateWishlistItem(item.id, {
      eventDay: 3,
      purchased: true,
      quantity: 1,
    });
    expect(updated).toMatchObject({
      eventDay: 3,
      purchased: true,
      quantity: 1,
      circle: "星空書房",
      creators: "山田、佐藤",
      fandomTagIds: [fandom.id],
      characterTagIds: [character.id],
      pairingTagIds: [pairing.id],
      genres: "漫画",
      tags: "新刊、会場限定",
      adultRating: "r18",
      publishedOn: "2026-08-10",
      edition: "初版",
      coverUrl: "/api/media/media/covers/wishlist.webp",
      thumbnailUrl: "/api/media/media/thumbs/wishlist.webp",
      booth: "東A-01a",
      priceYen: 1000,
      notes: "会場限定",
      links: [
        "[告知ポスト](https://twitter.com/example/status/1)",
        "https://example.com/catalog",
      ],
    });
    expect(updated?.bookId).toEqual(expect.any(String));
    const registeredBook = getBook(updated!.bookId!);
    expect(registeredBook).toMatchObject({
      title: "新刊セット",
      circles: ["星空書房"],
      creators: ["佐藤", "山田"],
      adultRating: "r18",
      publishedOn: "2026-08-10",
      edition: "初版",
      notes: "会場限定",
      links: [
        "[告知ポスト](https://twitter.com/example/status/1)",
        "https://example.com/catalog",
      ],
      coverUrl: "/api/media/media/covers/wishlist.webp",
      thumbnailUrl: "/api/media/media/thumbs/wishlist.webp",
      tags: expect.arrayContaining([
        expect.objectContaining({ id: fandom.id, type: "fandom" }),
        expect.objectContaining({ id: character.id, type: "character" }),
        expect.objectContaining({ id: pairing.id, type: "pairing" }),
        expect.objectContaining({ name: "漫画", type: "genre" }),
        expect.objectContaining({ name: "新刊", type: "custom" }),
      ]),
      ownedCount: 1,
      acquisitions: [
        {
          eventId: event.id,
          purchasedOn: "2026-08-17",
          priceYen: 1000,
          quantity: 1,
          notes: "配置: 東A-01a",
        },
      ],
    });

    const unpurchased = updateWishlistItem(item.id, { purchased: false });
    expect(unpurchased).toMatchObject({
      purchased: false,
      bookId: updated!.bookId,
    });
    const repurchased = updateWishlistItem(item.id, { purchased: true });
    expect(repurchased).toMatchObject({
      purchased: true,
      bookId: updated!.bookId,
    });
    expect(listBooks({ eventId: event.id }).books).toHaveLength(1);

    expect(updateWishlistItem(item.id, { eventDay: 4 })).toBeNull();
    expect(listEvents()[0]).toMatchObject({
      wishlistCount: 1,
      wishlistRemainingCount: 0,
    });

    expect(deleteWishlistItem(item.id)).toBe(true);
    expect(deleteWishlistItem(item.id)).toBe(false);
    expect(listWishlistItems(event.id)).toEqual([]);
    expect(getBook(updated!.bookId!)).not.toBeNull();
  });

  it("既存イベントを更新でき、ほしいものが期間外になる変更を判定できる", () => {
    const event = createEvent({
      name: "変更前イベント",
      startsOn: "2026-08-15",
      endsOn: "2026-08-17",
      venue: "変更前会場",
      notes: "変更前メモ",
    })!;
    createWishlistItem(event.id, {
      eventDay: 3,
      title: "3日目の新刊",
      circle: "",
      booth: "",
      quantity: 1,
      priceYen: null,
      notes: "",
      purchased: false,
    });

    expect(
      hasWishlistItemsOutsideEventRange(
        event.id,
        "2026-08-15",
        "2026-08-16",
      ),
    ).toBe(true);
    expect(
      hasWishlistItemsOutsideEventRange(
        event.id,
        "2026-08-15",
        "2026-08-17",
      ),
    ).toBe(false);

    const updated = updateEvent(event.id, {
      name: "変更後イベント",
      startsOn: "2026-08-16",
      endsOn: "2026-08-18",
      venue: "変更後会場",
      notes: "変更後メモ",
    });
    expect(updated).toMatchObject({
      id: event.id,
      name: "変更後イベント",
      starts_on: "2026-08-16",
      ends_on: "2026-08-18",
      venue: "変更後会場",
      notes: "変更後メモ",
    });
    expect(getEvent(event.id)).toMatchObject(updated!);
    expect(listEvents()[0]).toMatchObject({
      id: event.id,
      name: "変更後イベント",
      startsOn: "2026-08-16",
      endsOn: "2026-08-18",
      venue: "変更後会場",
      notes: "変更後メモ",
    });
  });

  it("対象日未指定のほしいものは1日目として扱う", () => {
    const event = createEvent({
      name: "単日イベント",
      startsOn: "2026-09-01",
      endsOn: "",
      venue: "",
      notes: "",
    })!;
    createWishlistItem(
      event.id,
      wishlistItemInputSchema.parse({ title: "初日の新刊" }),
    );

    expect(listWishlistItems(event.id)[0]).toMatchObject({ eventDay: 1 });
  });

  it("購入済みのほしいものを直接追加した場合も蔵書を1件だけ作成する", () => {
    const event = createEvent({
      name: "購入済み登録イベント",
      startsOn: "2026-09-02",
      endsOn: "",
      venue: "",
      notes: "",
    })!;
    const item = createWishlistItem(event.id, {
      eventDay: 1,
      title: "購入済み新刊",
      circle: "新刊サークル",
      booth: "",
      quantity: 1,
      priceYen: 500,
      notes: "",
      purchased: true,
    })!;

    expect(item).toMatchObject({
      purchased: true,
      bookId: expect.any(String),
    });
    expect(listBooks({ eventId: event.id }).books).toHaveLength(1);
    expect(updateWishlistItem(item.id, { purchased: true })?.bookId).toBe(
      item.bookId,
    );
    expect(listBooks({ eventId: event.id }).books).toHaveLength(1);
  });
});
