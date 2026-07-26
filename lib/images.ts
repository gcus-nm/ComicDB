import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { dataDirectory } from "./env";
import { HttpError } from "./security";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const ALLOWED_FORMAT = new Set(["jpeg", "png", "webp", "avif"]);

export async function saveCover(file: File | null | undefined) {
  if (!file || file.size === 0) return null;
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, "画像は20MB以下にしてください。");
  }
  if (/hei[cf]/iu.test(file.type) || /\.hei[cf]$/iu.test(file.name)) {
    throw new HttpError(
      415,
      "HEIC画像は直接取り込めません。JPEG・PNG・WebP・AVIFへ変換してください。",
    );
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new HttpError(415, "対応していない画像形式です。");
  }

  const input = Buffer.from(await file.arrayBuffer());
  const image = sharp(input, {
    failOn: "error",
    limitInputPixels: 50_000_000,
  });
  const metadata = await image.metadata();
  if (!metadata.format || !ALLOWED_FORMAT.has(metadata.format)) {
    throw new HttpError(415, "画像の内容を確認できませんでした。");
  }

  const id = randomUUID();
  const covers = path.join(dataDirectory(), "media", "covers");
  const thumbs = path.join(dataDirectory(), "media", "thumbs");
  await Promise.all([mkdir(covers, { recursive: true }), mkdir(thumbs, { recursive: true })]);
  const coverName = `${id}.webp`;
  const thumbName = `${id}.webp`;
  const coverPath = path.join(covers, coverName);
  const thumbPath = path.join(thumbs, thumbName);
  const coverTemp = `${coverPath}.tmp`;
  const thumbTemp = `${thumbPath}.tmp`;

  try {
    await sharp(input, { failOn: "error", limitInputPixels: 50_000_000 })
      .autoOrient()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84, effort: 4 })
      .toFile(coverTemp);
    await sharp(input, { failOn: "error", limitInputPixels: 50_000_000 })
      .autoOrient()
      .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toFile(thumbTemp);
    await Promise.all([rename(coverTemp, coverPath), rename(thumbTemp, thumbPath)]);
  } catch (error) {
    await Promise.all([
      rm(coverTemp, { force: true }),
      rm(thumbTemp, { force: true }),
      rm(coverPath, { force: true }),
      rm(thumbPath, { force: true }),
    ]);
    throw error;
  }

  return {
    coverPath: `media/covers/${coverName}`,
    thumbnailPath: `media/thumbs/${thumbName}`,
  };
}

export async function readMedia(relativePath: string) {
  const base = dataDirectory();
  const resolved = path.resolve(base, relativePath);
  if (!resolved.startsWith(`${base}${path.sep}`)) {
    throw new HttpError(400, "不正な画像パスです。");
  }
  return readFile(resolved);
}

export async function removeStoredMedia(relativePaths: string[]) {
  const mediaBase = path.join(dataDirectory(), "media");
  await Promise.all(
    relativePaths.map(async (relativePath) => {
      const resolved = path.resolve(dataDirectory(), relativePath);
      if (!resolved.startsWith(`${mediaBase}${path.sep}`)) {
        throw new HttpError(400, "不正な画像パスです。");
      }
      await rm(resolved, { force: true });
    }),
  );
}

export async function writeTestImage(relativePath: string, bytes: Uint8Array) {
  const target = path.join(dataDirectory(), relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
