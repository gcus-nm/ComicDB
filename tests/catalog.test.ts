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
  deleteTaxonomyTag,
  findDuplicateCandidates,
  listBooks,
  listTaxonomyTags,
} from "@/lib/catalog";
import { exportCsv, importCsv } from "@/lib/csv";

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
  });

  it("CSVを出力して再取込できる", () => {
    createBook({
      title: "CSVテスト",
      circles: "表計算部",
      creators: "",
      fandoms: "",
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
      favorite: false,
      notes: "",
      eventId: null,
      purchasedOn: "",
      priceYen: null,
      quantity: 1,
      acquisitionNotes: "",
    });
    const csv = exportCsv();
    closeDbForTests();
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = mkdtempSync(path.join(os.tmpdir(), "comicdb-test-import-"));
    process.env.DATA_DIR = tempDir;
    expect(importCsv(csv).imported).toBe(1);
    expect(listBooks({ q: "CSVテスト" }).total).toBe(1);
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
});
