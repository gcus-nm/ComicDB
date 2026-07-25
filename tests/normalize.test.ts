import { describe, expect, it } from "vitest";
import { diceSimilarity, normalizeSearchText, normalizeText, splitNames } from "@/lib/normalize";

describe("文字列正規化", () => {
  it("全角英数・空白・大文字小文字を揃える", () => {
    expect(normalizeText("  ＡＢＣ　夏  ")).toBe("abc 夏");
  });

  it("検索用文字列から主な記号を除く", () => {
    expect(normalizeSearchText("A×B【再版】")).toBe("a×b 再版");
  });

  it("名前を区切り、正規化した重複を除く", () => {
    expect(splitNames("Alice、Ａｌｉｃｅ; Bob")).toEqual(["Alice", "Bob"]);
  });

  it("近いタイトルほど類似度が高い", () => {
    expect(diceSimilarity("夏の記憶", "夏の記憶 第2版")).toBeGreaterThan(
      diceSimilarity("夏の記憶", "冬の景色"),
    );
  });
});
