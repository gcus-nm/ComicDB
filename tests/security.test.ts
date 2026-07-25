import { describe, expect, it } from "vitest";
import { assertMutationAllowed, HttpError } from "@/lib/security";

describe("Origin検証", () => {
  it("設定済みOriginを許可する", () => {
    process.env.APP_ORIGIN = "https://comicdb.example.test";
    expect(() =>
      assertMutationAllowed(
        new Request("https://comicdb.example.test/api/books", {
          method: "POST",
          headers: { origin: "https://comicdb.example.test" },
        }),
      ),
    ).not.toThrow();
  });

  it("異なるOriginを拒否する", () => {
    process.env.APP_ORIGIN = "https://comicdb.example.test";
    expect(() =>
      assertMutationAllowed(
        new Request("https://comicdb.example.test/api/books", {
          method: "POST",
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrow(HttpError);
  });
});
