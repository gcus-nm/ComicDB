import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PATCH } from "@/app/api/books/[id]/route";
import { closeDbForTests } from "@/db";
import { createAdmin, SESSION_COOKIE } from "@/lib/auth";
import { createBook } from "@/lib/catalog";
import { saveCover } from "@/lib/images";
import { bookInputSchema } from "@/lib/validators";

let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "comicdb-book-image-edit-"));
  process.env.DATA_DIR = tempDir;
});

afterEach(() => {
  closeDbForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

async function imageFile(name: string, color: string) {
  const bytes = await sharp({
    create: {
      width: 600,
      height: 800,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
  return new File([bytes], name, { type: "image/png" });
}

function editRequest(
  id: string,
  token: string,
  formData: FormData,
) {
  return PATCH(
    new Request(`http://localhost:3000/api/books/${id}`, {
      method: "PATCH",
      headers: {
        cookie: `${SESSION_COOKIE}=${token}`,
        "x-comicdb-request": "1",
      },
      body: formData,
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("蔵書画像の編集", () => {
  it("表紙を差し替えて元ファイルを削除し、登録済み表紙も削除できる", async () => {
    const session = await createAdmin("owner", "a-very-long-password");
    const originalMedia = await saveCover(
      await imageFile("original.png", "#8f2f22"),
    );
    const book = createBook(
      bookInputSchema.parse({ title: "画像編集テスト" }),
      originalMedia,
    );

    const replacementForm = new FormData();
    replacementForm.set("title", book.title);
    replacementForm.set(
      "cover",
      await imageFile("replacement.png", "#245f74"),
    );
    const replacementResponse = await editRequest(
      book.id,
      session.token,
      replacementForm,
    );
    const replaced = (await replacementResponse.json()) as {
      coverUrl: string | null;
      thumbnailUrl: string | null;
    };

    expect(replacementResponse.status).toBe(200);
    expect(replaced.coverUrl).not.toBe(book.coverUrl);
    expect(existsSync(path.join(tempDir, originalMedia!.coverPath))).toBe(false);
    expect(existsSync(path.join(tempDir, originalMedia!.thumbnailPath))).toBe(
      false,
    );

    const replacementPaths = [
      replaced.coverUrl,
      replaced.thumbnailUrl,
    ].map((url) => url!.slice("/api/media/".length));
    for (const relativePath of replacementPaths) {
      expect(existsSync(path.join(tempDir, relativePath))).toBe(true);
    }

    const metadataOnlyForm = new FormData();
    metadataOnlyForm.set("title", "タイトルのみ変更");
    const metadataOnlyResponse = await editRequest(
      book.id,
      session.token,
      metadataOnlyForm,
    );
    const metadataOnlyUpdate = (await metadataOnlyResponse.json()) as {
      title: string;
      coverUrl: string | null;
    };

    expect(metadataOnlyResponse.status).toBe(200);
    expect(metadataOnlyUpdate.title).toBe("タイトルのみ変更");
    expect(metadataOnlyUpdate.coverUrl).toBe(replaced.coverUrl);
    for (const relativePath of replacementPaths) {
      expect(existsSync(path.join(tempDir, relativePath))).toBe(true);
    }

    const removalForm = new FormData();
    removalForm.set("title", metadataOnlyUpdate.title);
    removalForm.set("removeCover", "true");
    const removalResponse = await editRequest(
      book.id,
      session.token,
      removalForm,
    );
    const removed = (await removalResponse.json()) as {
      coverUrl: string | null;
      thumbnailUrl: string | null;
    };

    expect(removalResponse.status).toBe(200);
    expect(removed.coverUrl).toBeNull();
    expect(removed.thumbnailUrl).toBeNull();
    for (const relativePath of replacementPaths) {
      expect(existsSync(path.join(tempDir, relativePath))).toBe(false);
    }
  });
});
