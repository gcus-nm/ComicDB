import { z } from "zod";
import {
  eventDayForDate,
  isIsoDate,
} from "./event-dates";
import { parseExternalLink } from "./links";

const optionalDate = z
  .string()
  .trim()
  .refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/u.test(value), "日付形式が不正です。");

const linkEntry = z
  .string()
  .trim()
  .max(2252, "リンクの表示名とURLが長すぎます。")
  .refine(
    (value) => parseExternalLink(value) !== null,
    "リンクはURL、または[表示名](URL)を1行に1件入力してください。URLにはhttp://かhttps://を使用できます。",
  );

const linksInput = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      return value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean);
    }
    if (Array.isArray(value)) {
      return value.flatMap((item) =>
        typeof item === "string" ? item.split(/\r?\n/u) : item,
      ).map((item) => typeof item === "string" ? item.trim() : item).filter(Boolean);
    }
    return value;
  },
  z.array(linkEntry).max(50, "リンクは50件まで登録できます。"),
).optional();

export const bookInputSchema = z.object({
  title: z.string().trim().min(1, "タイトルは必須です。").max(300),
  circles: z.union([z.string(), z.array(z.string())]).optional(),
  creators: z.union([z.string(), z.array(z.string())]).optional(),
  fandoms: z.union([z.string(), z.array(z.string())]).optional(),
  characters: z.union([z.string(), z.array(z.string())]).optional(),
  pairings: z.union([z.string(), z.array(z.string())]).optional(),
  fandomTagIds: z.union([z.string(), z.array(z.string())]).optional(),
  characterTagIds: z.union([z.string(), z.array(z.string())]).optional(),
  pairingTagIds: z.union([z.string(), z.array(z.string())]).optional(),
  genres: z.union([z.string(), z.array(z.string())]).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  adultRating: z.enum(["general", "r18"]).default("general"),
  publishedOn: optionalDate.optional().default(""),
  edition: z.string().trim().max(120).optional().default(""),
  storageLocationId: z.string().trim().optional().nullable(),
  storageLocation: z.string().trim().max(120).optional(),
  readStatus: z.enum(["unread", "reading", "read"]).default("unread"),
  ownershipStatus: z.enum(["owned", "disposed"]).default("owned"),
  favorite: z.coerce.boolean().default(false),
  notes: z.string().trim().max(5000).optional().default(""),
  links: linksInput,
  eventId: z.string().trim().optional().nullable(),
  purchasedOn: optionalDate.optional().default(""),
  priceYen: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  acquisitionNotes: z.string().trim().max(1000).optional().default(""),
});

export const ownershipStatusInputSchema = z.object({
  ownershipStatus: z.enum(["owned", "disposed"]),
});

export const eventInputSchema = z
  .object({
    name: z.string().trim().min(1, "イベント名は必須です。").max(200),
    startsOn: optionalDate.refine(Boolean, "開催日は必須です。"),
    endsOn: optionalDate.optional().default(""),
    venue: z.string().trim().max(200).optional().default(""),
    notes: z.string().trim().max(2000).optional().default(""),
  })
  .superRefine((input, context) => {
    if (!isIsoDate(input.startsOn)) {
      context.addIssue({
        code: "custom",
        path: ["startsOn"],
        message: "開催日が存在しない日付です。",
      });
      return;
    }
    if (input.endsOn && !isIsoDate(input.endsOn)) {
      context.addIssue({
        code: "custom",
        path: ["endsOn"],
        message: "終了日が存在しない日付です。",
      });
      return;
    }
    if (
      input.endsOn &&
      (eventDayForDate(input.startsOn, input.endsOn) ?? 0) < 1
    ) {
      context.addIssue({
        code: "custom",
        path: ["endsOn"],
        message: "終了日は開催日以降を指定してください。",
      });
    }
  });

export const acquisitionInputSchema = z.object({
  eventId: z.string().trim().optional().nullable(),
  purchasedOn: optionalDate.optional().default(""),
  priceYen: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  notes: z.string().trim().max(1000).optional().default(""),
});

export const wishlistItemInputSchema = z.object({
  eventDay: z.coerce.number().int().min(1).default(1),
  title: z.string().trim().min(1, "タイトルは必須です。").max(300),
  circle: z.string().trim().max(200).optional().default(""),
  creators: z.union([z.string(), z.array(z.string())]).optional().default(""),
  fandomTagIds: z.union([z.string(), z.array(z.string())]).optional(),
  characterTagIds: z.union([z.string(), z.array(z.string())]).optional(),
  pairingTagIds: z.union([z.string(), z.array(z.string())]).optional(),
  genres: z.union([z.string(), z.array(z.string())]).optional().default(""),
  tags: z.union([z.string(), z.array(z.string())]).optional().default(""),
  adultRating: z.enum(["general", "r18"]).default("general"),
  publishedOn: optionalDate.optional().default(""),
  edition: z.string().trim().max(120).optional().default(""),
  booth: z.string().trim().max(100).optional().default(""),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  priceYen: z.coerce.number().int().min(0).max(10_000_000).nullable().optional(),
  notes: z.string().trim().max(5000).optional().default(""),
  links: linksInput,
  purchased: z.boolean().optional().default(false),
});

export const wishlistItemUpdateSchema = z.object({
  eventDay: z.coerce.number().int().min(1).optional(),
  title: z.string().trim().min(1, "タイトルは必須です。").max(300).optional(),
  circle: z.string().trim().max(200).optional(),
  creators: z.union([z.string(), z.array(z.string())]).optional(),
  fandomTagIds: z.union([z.string(), z.array(z.string())]).optional(),
  characterTagIds: z.union([z.string(), z.array(z.string())]).optional(),
  pairingTagIds: z.union([z.string(), z.array(z.string())]).optional(),
  genres: z.union([z.string(), z.array(z.string())]).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  adultRating: z.enum(["general", "r18"]).optional(),
  publishedOn: optionalDate.optional(),
  edition: z.string().trim().max(120).optional(),
  booth: z.string().trim().max(100).optional(),
  quantity: z.coerce.number().int().min(1).max(99).optional(),
  priceYen: z.coerce.number().int().min(0).max(10_000_000).nullable().optional(),
  notes: z.string().trim().max(5000).optional(),
  links: linksInput,
  purchased: z.boolean().optional(),
});
