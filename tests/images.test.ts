import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveCover } from "@/lib/images";

let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "comicdb-image-"));
  process.env.DATA_DIR = tempDir;
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("表紙処理", () => {
  it("画像を表示用とサムネイルのWebPへ変換する", async () => {
    const png = await sharp({
      create: {
        width: 900,
        height: 1200,
        channels: 3,
        background: "#8f2f22",
      },
    })
      .png()
      .toBuffer();
    const result = await saveCover(new File([png], "cover.png", { type: "image/png" }));
    expect(result?.coverPath).toMatch(/^media\/covers\/.+\.webp$/u);
    expect(result?.thumbnailPath).toMatch(/^media\/thumbs\/.+\.webp$/u);
  });

  it("HEICを明示的に拒否する", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "cover.heic", {
      type: "image/heic",
    });
    await expect(saveCover(file)).rejects.toThrow("HEIC");
  });
});
