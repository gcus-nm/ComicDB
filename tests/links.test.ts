import { describe, expect, it } from "vitest";
import { parseExternalLink } from "@/lib/links";
import { bookInputSchema } from "@/lib/validators";

describe("関連リンク", () => {
  it("URLだけの形式とMarkdown形式を解釈する", () => {
    expect(parseExternalLink("https://example.com/catalog")).toEqual({
      label: "https://example.com/catalog",
      url: "https://example.com/catalog",
    });
    expect(
      parseExternalLink("[Webカタログ](https://example.com/catalog)"),
    ).toEqual({
      label: "Webカタログ",
      url: "https://example.com/catalog",
    });
  });

  it("複数行を保持し、HTTP以外や壊れたMarkdownを拒否する", () => {
    expect(
      bookInputSchema.parse({
        title: "リンクテスト",
        links: "[告知](https://example.com/post)\nhttps://example.com/shop",
      }).links,
    ).toEqual([
      "[告知](https://example.com/post)",
      "https://example.com/shop",
    ]);
    expect(parseExternalLink("[ローカル](javascript:alert(1))")).toBeNull();
    expect(parseExternalLink("[閉じ括弧なし](https://example.com")).toBeNull();
  });
});
