import { z } from "zod";

const optionalDate = z
  .string()
  .trim()
  .refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/u.test(value), "日付形式が不正です。");

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
  favorite: z.coerce.boolean().default(false),
  notes: z.string().trim().max(5000).optional().default(""),
  eventId: z.string().trim().optional().nullable(),
  purchasedOn: optionalDate.optional().default(""),
  priceYen: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  acquisitionNotes: z.string().trim().max(1000).optional().default(""),
});

export const eventInputSchema = z.object({
  name: z.string().trim().min(1, "イベント名は必須です。").max(200),
  startsOn: optionalDate.refine(Boolean, "開催日は必須です。"),
  endsOn: optionalDate.optional().default(""),
  venue: z.string().trim().max(200).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
});

export const acquisitionInputSchema = z.object({
  eventId: z.string().trim().optional().nullable(),
  purchasedOn: optionalDate.optional().default(""),
  priceYen: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  notes: z.string().trim().max(1000).optional().default(""),
});
