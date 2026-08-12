import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { getDb } from "@/db";
import {
  bookInputSchema,
  eventInputSchema,
  wishlistItemInputSchema,
  wishlistItemUpdateSchema,
} from "./validators";
import { diceSimilarity, normalizeSearchText, normalizeText, splitNames } from "./normalize";
import type {
  BookDetail,
  BookSummary,
  EventSummary,
  OwnershipStatus,
  TagType,
  WishlistItem,
} from "./types";
import {
  eventDateForDay,
  isEventDayWithinEvent,
} from "./event-dates";

type BookInput = z.infer<typeof bookInputSchema>;
type BookMedia = { coverPath: string; thumbnailPath: string };
type EventInput = z.infer<typeof eventInputSchema>;
type WishlistItemInput = z.input<typeof wishlistItemInputSchema>;
type WishlistItemUpdateInput = z.infer<typeof wishlistItemUpdateSchema>;

type BookRow = {
  id: string;
  title: string;
  adult_rating: "general" | "r18";
  edition: string;
  read_status: "unread" | "reading" | "read";
  ownership_status: OwnershipStatus;
  disposed_at: string | null;
  favorite: number;
  notes: string;
  links: string;
  cover_path: string | null;
  thumbnail_path: string | null;
  storage_location_id?: string | null;
  storage_location: string | null;
  circles: string;
  creators: string;
  tags: string;
  owned_count: number;
  latest_event: string | null;
  updated_at: string;
  published_on?: string | null;
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toSummary(row: BookRow): BookSummary {
  return {
    id: row.id,
    title: row.title,
    adultRating: row.adult_rating,
    edition: row.edition,
    readStatus: row.read_status,
    ownershipStatus: row.ownership_status,
    disposedAt: row.disposed_at,
    favorite: Boolean(row.favorite),
    notes: row.notes,
    links: parseJson<string[]>(row.links, []),
    coverUrl: row.cover_path ? `/api/media/${row.cover_path}` : null,
    thumbnailUrl: row.thumbnail_path ? `/api/media/${row.thumbnail_path}` : null,
    storageLocation: row.storage_location,
    circles: parseJson<string[]>(row.circles, []),
    creators: parseJson<string[]>(row.creators, []),
    tags: parseJson<BookSummary["tags"]>(row.tags, []),
    ownedCount: Number(row.owned_count ?? 0),
    latestEvent: row.latest_event,
    updatedAt: row.updated_at,
  };
}

const BOOK_SELECT = `
  SELECT
    b.id,
    b.title,
    b.adult_rating,
    b.edition,
    b.read_status,
    b.ownership_status,
    b.disposed_at,
    b.favorite,
    b.notes,
    b.links,
    b.cover_path,
    b.thumbnail_path,
    b.storage_location_id,
    b.published_on,
    sl.name AS storage_location,
    COALESCE((
      SELECT json_group_array(name) FROM (
        SELECT c.name AS name
        FROM book_circles bc
        JOIN circles c ON c.id = bc.circle_id
        WHERE bc.book_id = b.id
        ORDER BY bc.is_primary DESC, c.name
      )
    ), '[]') AS circles,
    COALESCE((
      SELECT json_group_array(name) FROM (
        SELECT c.name AS name
        FROM book_creators bc
        JOIN creators c ON c.id = bc.creator_id
        WHERE bc.book_id = b.id
        ORDER BY c.name
      )
    ), '[]') AS creators,
    COALESCE((
      SELECT json_group_array(json_object(
        'id', id,
        'name', name,
        'type', type,
        'parentId', parent_id,
        'parentName', parent_name
      )) FROM (
        SELECT t.id AS id, t.name AS name, t.type AS type,
               t.parent_tag_id AS parent_id, parent.name AS parent_name
        FROM book_tags bt
        JOIN tags t ON t.id = bt.tag_id
        LEFT JOIN tags parent ON parent.id = t.parent_tag_id
        WHERE bt.book_id = b.id
        ORDER BY t.type, t.name
      )
    ), '[]') AS tags,
    COALESCE((SELECT SUM(a.quantity) FROM acquisitions a WHERE a.book_id = b.id), 0) AS owned_count,
    (
      SELECT e.name
      FROM acquisitions a
      LEFT JOIN events e ON e.id = a.event_id
      WHERE a.book_id = b.id AND e.id IS NOT NULL
      ORDER BY COALESCE(a.purchased_on, a.created_at) DESC
      LIMIT 1
    ) AS latest_event,
    b.updated_at
  FROM books b
  LEFT JOIN storage_locations sl ON sl.id = b.storage_location_id
`;

export type BookFilters = {
  q?: string;
  adultRating?: string;
  readStatus?: string;
  ownershipStatus?: string;
  favorite?: boolean;
  eventId?: string;
  storageId?: string;
  tag?: string;
  page?: number;
  limit?: number;
};

export function listBooks(filters: BookFilters = {}) {
  const db = getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];
  const query = normalizeSearchText(filters.q ?? "");

  if (query) {
    if (query.length >= 3 && db.ftsAvailable) {
      clauses.push(
        "b.id IN (SELECT book_id FROM books_search WHERE books_search MATCH ?)",
      );
      params.push(`"${query.replaceAll('"', '""')}"`);
    } else {
      clauses.push(
        `b.id IN (
          SELECT b2.id FROM books b2
          LEFT JOIN book_circles bc2 ON bc2.book_id = b2.id
          LEFT JOIN circles c2 ON c2.id = bc2.circle_id
          LEFT JOIN book_creators bcr2 ON bcr2.book_id = b2.id
          LEFT JOIN creators cr2 ON cr2.id = bcr2.creator_id
          LEFT JOIN book_tags bt2 ON bt2.book_id = b2.id
          LEFT JOIN tags t2 ON t2.id = bt2.tag_id
          WHERE b2.normalized_title LIKE ?
             OR c2.normalized_name LIKE ?
             OR cr2.normalized_name LIKE ?
             OR t2.normalized_name LIKE ?
        )`,
      );
      const like = `%${query}%`;
      params.push(like, like, like, like);
    }
  }
  if (filters.adultRating === "general" || filters.adultRating === "r18") {
    clauses.push("b.adult_rating = ?");
    params.push(filters.adultRating);
  }
  if (["unread", "reading", "read"].includes(filters.readStatus ?? "")) {
    clauses.push("b.read_status = ?");
    params.push(filters.readStatus);
  }
  const ownershipStatus = filters.ownershipStatus ?? "owned";
  if (ownershipStatus === "owned" || ownershipStatus === "disposed") {
    clauses.push("b.ownership_status = ?");
    params.push(ownershipStatus);
  }
  if (filters.favorite) clauses.push("b.favorite = 1");
  if (filters.eventId) {
    clauses.push(
      "EXISTS (SELECT 1 FROM acquisitions fa WHERE fa.book_id = b.id AND fa.event_id = ?)",
    );
    params.push(filters.eventId);
  }
  if (filters.storageId) {
    clauses.push("b.storage_location_id = ?");
    params.push(filters.storageId);
  }
  if (filters.tag) {
    clauses.push(
      `EXISTS (
        SELECT 1 FROM book_tags fbt
        JOIN tags ft ON ft.id = fbt.tag_id
        WHERE fbt.book_id = b.id AND ft.normalized_name = ?
      )`,
    );
    params.push(normalizeText(filters.tag));
  }

  const limit = Math.min(2_000, Math.max(1, filters.limit ?? 48));
  const page = Math.max(1, filters.page ?? 1);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.sqlite
    .prepare(`${BOOK_SELECT} ${where} ORDER BY b.updated_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit) as BookRow[];
  const countRow = db.sqlite
    .prepare(`SELECT COUNT(*) AS count FROM books b ${where}`)
    .get(...params) as { count: number };
  return {
    books: rows.map(toSummary),
    total: countRow.count,
    page,
    pages: Math.max(1, Math.ceil(countRow.count / limit)),
  };
}

export function getBook(id: string): BookDetail | null {
  const row = getDb().sqlite
    .prepare(`${BOOK_SELECT} WHERE b.id = ?`)
    .get(id) as BookRow | undefined;
  if (!row) return null;
  const acquisitions = getDb().sqlite
    .prepare(
      `SELECT a.id, a.event_id, e.name AS event_name, a.purchased_on,
              a.price_yen, a.quantity, a.notes
       FROM acquisitions a
       LEFT JOIN events e ON e.id = a.event_id
       WHERE a.book_id = ?
       ORDER BY COALESCE(a.purchased_on, a.created_at) DESC`,
    )
    .all(id) as Array<{
    id: string;
    event_id: string | null;
    event_name: string | null;
    purchased_on: string | null;
    price_yen: number | null;
    quantity: number;
    notes: string;
  }>;
  return {
    ...toSummary(row),
    publishedOn: row.published_on ?? null,
    storageLocationId: row.storage_location_id ?? null,
    acquisitions: acquisitions.map((item) => ({
      id: item.id,
      eventId: item.event_id,
      eventName: item.event_name,
      purchasedOn: item.purchased_on,
      priceYen: item.price_yen,
      quantity: item.quantity,
      notes: item.notes,
    })),
  };
}

function findOrCreateNamed(
  table: "circles" | "creators",
  name: string,
  now: string,
) {
  const db = getDb().sqlite;
  const normalized = normalizeText(name);
  const existing = db
    .prepare(`SELECT id FROM ${table} WHERE normalized_name = ?`)
    .get(normalized) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO ${table} (id, name, normalized_name, created_at) VALUES (?, ?, ?, ?)`,
  ).run(id, name.trim(), normalized, now);
  return id;
}

function findOrCreateTag(
  name: string,
  type: TagType,
  now: string,
  parentTagId: string | null = null,
) {
  const db = getDb().sqlite;
  const normalized = normalizeText(name);
  const existing = db
    .prepare(
      "SELECT id FROM tags WHERE normalized_name = ? AND type = ? AND parent_tag_id IS ?",
    )
    .get(normalized, type, parentTagId) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO tags
       (id, name, normalized_name, type, parent_tag_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, name.trim(), normalized, type, parentTagId, now);
  return id;
}

function findOrCreateStorage(name: string | undefined, now: string) {
  if (!name?.trim()) return null;
  const db = getDb().sqlite;
  const existing = db
    .prepare("SELECT id FROM storage_locations WHERE name = ? AND parent_id IS NULL")
    .get(name.trim()) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO storage_locations
       (id, name, parent_id, notes, created_at, updated_at)
     VALUES (?, ?, NULL, '', ?, ?)`,
  ).run(id, name.trim(), now, now);
  return id;
}

function replaceRelationships(bookId: string, input: BookInput, now: string) {
  const db = getDb().sqlite;
  db.prepare("DELETE FROM book_circles WHERE book_id = ?").run(bookId);
  splitNames(input.circles).forEach((name, index) => {
    const id = findOrCreateNamed("circles", name, now);
    db.prepare(
      "INSERT INTO book_circles (book_id, circle_id, is_primary) VALUES (?, ?, ?)",
    ).run(bookId, id, index === 0 ? 1 : 0);
  });

  db.prepare("DELETE FROM book_creators WHERE book_id = ?").run(bookId);
  splitNames(input.creators).forEach((name) => {
    const id = findOrCreateNamed("creators", name, now);
    db.prepare(
      "INSERT INTO book_creators (book_id, creator_id) VALUES (?, ?)",
    ).run(bookId, id);
  });

  db.prepare("DELETE FROM book_tags WHERE book_id = ?").run(bookId);
  const addTag = (tagId: string) => {
    db.prepare("INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)").run(
      bookId,
      tagId,
    );
  };
  const selectedFandomIds = splitNames(input.fandomTagIds);
  if (selectedFandomIds.length) {
    for (const id of selectedFandomIds) {
      const tag = db
        .prepare("SELECT id FROM tags WHERE id = ? AND type = 'fandom'")
        .get(id) as { id: string } | undefined;
      if (!tag) throw new Error("選択された作品が見つかりません。");
      addTag(tag.id);
    }
  } else {
    for (const name of splitNames(input.fandoms)) {
      const id = findOrCreateTag(name, "fandom", now);
      selectedFandomIds.push(id);
      addTag(id);
    }
  }

  const addSelectedChildren = (
    ids: string[],
    type: "character" | "pairing",
  ) => {
    for (const id of ids) {
      const tag = db
        .prepare("SELECT id, parent_tag_id FROM tags WHERE id = ? AND type = ?")
        .get(id, type) as { id: string; parent_tag_id: string | null } | undefined;
      if (!tag) throw new Error("選択された分類が見つかりません。");
      if (tag.parent_tag_id && !selectedFandomIds.includes(tag.parent_tag_id)) {
        throw new Error("選択した作品に属さない分類が含まれています。");
      }
      addTag(tag.id);
    }
  };

  const characterIds = splitNames(input.characterTagIds);
  const pairingIds = splitNames(input.pairingTagIds);
  if (characterIds.length) {
    addSelectedChildren(characterIds, "character");
  } else {
    for (const name of splitNames(input.characters)) {
      addTag(
        findOrCreateTag(
          name,
          "character",
          now,
          selectedFandomIds.length === 1 ? selectedFandomIds[0] : null,
        ),
      );
    }
  }
  if (pairingIds.length) {
    addSelectedChildren(pairingIds, "pairing");
  } else {
    for (const name of splitNames(input.pairings)) {
      addTag(
        findOrCreateTag(
          name,
          "pairing",
          now,
          selectedFandomIds.length === 1 ? selectedFandomIds[0] : null,
        ),
      );
    }
  }

  const freeformGroups: Array<[TagType, string | string[] | undefined]> = [
    ["genre", input.genres],
    ["custom", input.tags],
  ];
  for (const [type, names] of freeformGroups) {
    splitNames(names).forEach((name) => {
      const id = findOrCreateTag(name, type, now);
      addTag(id);
    });
  }
}

export function syncBookSearch(bookId: string) {
  const db = getDb();
  if (!db.ftsAvailable) return;
  const row = db.sqlite
    .prepare(
      `SELECT b.title, b.edition, b.notes,
        COALESCE(group_concat(DISTINCT c.name), '') AS circles,
        COALESCE(group_concat(DISTINCT cr.name), '') AS creators,
        COALESCE(group_concat(DISTINCT t.name), '') AS tags
       FROM books b
       LEFT JOIN book_circles bc ON bc.book_id = b.id
       LEFT JOIN circles c ON c.id = bc.circle_id
       LEFT JOIN book_creators bcr ON bcr.book_id = b.id
       LEFT JOIN creators cr ON cr.id = bcr.creator_id
       LEFT JOIN book_tags bt ON bt.book_id = b.id
       LEFT JOIN tags t ON t.id = bt.tag_id
       WHERE b.id = ?
       GROUP BY b.id`,
    )
    .get(bookId) as
    | {
        title: string;
        edition: string;
        notes: string;
        circles: string;
        creators: string;
        tags: string;
      }
    | undefined;
  db.sqlite.prepare("DELETE FROM books_search WHERE book_id = ?").run(bookId);
  if (row) {
    const text = normalizeSearchText(Object.values(row).join(" "));
    db.sqlite
      .prepare("INSERT INTO books_search (book_id, search_text) VALUES (?, ?)")
      .run(bookId, text);
  }
}

export function createBook(
  input: BookInput,
  media?: BookMedia | null,
) {
  const db = getDb().sqlite;
  const id = randomUUID();
  const now = new Date().toISOString();
  const storageLocationId =
    input.storageLocationId || findOrCreateStorage(input.storageLocation, now);

  const transaction = db.transaction(() => {
    db.prepare(
      `INSERT INTO books (
        id, title, normalized_title, adult_rating, published_on, edition,
        storage_location_id, read_status, ownership_status, disposed_at,
        favorite, notes, links, cover_path, thumbnail_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.title,
      normalizeText(input.title),
      input.adultRating,
      input.publishedOn || null,
      input.edition,
      storageLocationId || null,
      input.readStatus,
      input.ownershipStatus,
      input.ownershipStatus === "disposed" ? now : null,
      input.favorite ? 1 : 0,
      input.notes,
      JSON.stringify(input.links ?? []),
      media?.coverPath ?? null,
      media?.thumbnailPath ?? null,
      now,
      now,
    );
    replaceRelationships(id, input, now);
    addAcquisition(id, {
      eventId: input.eventId,
      purchasedOn: input.purchasedOn,
      priceYen: input.priceYen,
      quantity: input.quantity,
      notes: input.acquisitionNotes,
    });
    if (input.ownershipStatus === "disposed") {
      db.prepare(
        `UPDATE books
         SET ownership_status = 'disposed', disposed_at = ?, updated_at = ?
         WHERE id = ?`,
      ).run(now, now, id);
    }
  });
  transaction();
  syncBookSearch(id);
  return getBook(id)!;
}

export function updateBook(
  id: string,
  input: BookInput,
  media?: BookMedia | null,
) {
  const db = getDb().sqlite;
  const current = getBook(id);
  if (!current) return null;
  const now = new Date().toISOString();
  const storageLocationId =
    input.storageLocationId || findOrCreateStorage(input.storageLocation, now);
  const mediaAssignment =
    media === undefined ? "" : ", cover_path = ?, thumbnail_path = ?";
  const mediaValues =
    media === undefined
      ? []
      : [media?.coverPath ?? null, media?.thumbnailPath ?? null];
  const links = input.links ?? current.links;
  const transaction = db.transaction(() => {
    db.prepare(
      `UPDATE books SET
        title = ?, normalized_title = ?, adult_rating = ?, published_on = ?,
        edition = ?, storage_location_id = ?, read_status = ?,
        ownership_status = ?, disposed_at = ?, favorite = ?, notes = ?, links = ?
        ${mediaAssignment},
        updated_at = ?
       WHERE id = ?`,
    ).run(
      input.title,
      normalizeText(input.title),
      input.adultRating,
      input.publishedOn || null,
      input.edition,
      storageLocationId || null,
      input.readStatus,
      input.ownershipStatus,
      input.ownershipStatus === "disposed"
        ? current.disposedAt ?? now
        : null,
      input.favorite ? 1 : 0,
      input.notes,
      JSON.stringify(links),
      ...mediaValues,
      now,
      id,
    );
    if (media !== undefined) {
      db.prepare(
        `UPDATE wishlist_items
         SET cover_path = ?, thumbnail_path = ?, updated_at = ?
         WHERE book_id = ?`,
      ).run(
        media?.coverPath ?? null,
        media?.thumbnailPath ?? null,
        now,
        id,
      );
    }
    replaceRelationships(id, input, now);
  });
  transaction();
  syncBookSearch(id);
  return getBook(id);
}

export function getBookMediaPaths(id: string) {
  const row = getDb()
    .sqlite.prepare(
      "SELECT cover_path, thumbnail_path FROM books WHERE id = ?",
    )
    .get(id) as
    | { cover_path: string | null; thumbnail_path: string | null }
    | undefined;
  if (!row) return null;
  return [row.cover_path, row.thumbnail_path].filter(
    (value): value is string => Boolean(value),
  );
}

export function addAcquisition(
  bookId: string,
  input: {
    eventId?: string | null;
    purchasedOn?: string;
    priceYen?: number | null;
    quantity?: number;
    notes?: string;
  },
) {
  const db = getDb().sqlite;
  let purchasedOn = input.purchasedOn || null;
  if (!purchasedOn && input.eventId) {
    const event = db
      .prepare("SELECT starts_on FROM events WHERE id = ?")
      .get(input.eventId) as { starts_on: string } | undefined;
    purchasedOn = event?.starts_on ?? null;
  }
  db.prepare(
    `INSERT INTO acquisitions
       (id, book_id, event_id, purchased_on, price_yen, quantity, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    bookId,
    input.eventId || null,
    purchasedOn,
    input.priceYen ?? null,
    input.quantity ?? 1,
    input.notes ?? "",
    new Date().toISOString(),
  );
  db.prepare(
    `UPDATE books
     SET ownership_status = 'owned', disposed_at = NULL, updated_at = ?
     WHERE id = ?`,
  ).run(new Date().toISOString(), bookId);
  return getBook(bookId);
}

export function setBookOwnershipStatus(
  id: string,
  ownershipStatus: OwnershipStatus,
) {
  const now = new Date().toISOString();
  const result = getDb()
    .sqlite.prepare(
      `UPDATE books
       SET ownership_status = ?,
           disposed_at = CASE WHEN ? = 'disposed' THEN COALESCE(disposed_at, ?) ELSE NULL END,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(ownershipStatus, ownershipStatus, now, now, id);
  return result.changes ? getBook(id) : null;
}

export function deleteBook(id: string) {
  const db = getDb().sqlite;
  const row = db
    .prepare("SELECT cover_path, thumbnail_path FROM books WHERE id = ?")
    .get(id) as
    | { cover_path: string | null; thumbnail_path: string | null }
    | undefined;
  if (!row) return null;
  db.transaction(() => {
    if (getDb().ftsAvailable) {
      db.prepare("DELETE FROM books_search WHERE book_id = ?").run(id);
    }
    db.prepare(
      `UPDATE wishlist_items
       SET cover_path = NULL, thumbnail_path = NULL, updated_at = ?
       WHERE book_id = ?`,
    ).run(new Date().toISOString(), id);
    db.prepare("DELETE FROM books WHERE id = ?").run(id);
  })();
  return [row.cover_path, row.thumbnail_path].filter(
    (value): value is string => Boolean(value),
  );
}

export function findDuplicateCandidates(title: string, circle = "") {
  const normalized = normalizeText(title);
  if (!normalized) return [];
  const rows = getDb().sqlite
    .prepare(
      `${BOOK_SELECT}
       WHERE b.normalized_title = ? OR b.normalized_title LIKE ?
       ORDER BY b.updated_at DESC
       LIMIT 30`,
    )
    .all(normalized, `%${normalized.slice(0, Math.max(1, normalized.length - 1))}%`) as BookRow[];
  const normalizedCircle = normalizeText(circle);
  return rows
    .map(toSummary)
    .map((book) => {
      const titleScore = diceSimilarity(title, book.title);
      const circleMatch =
        !normalizedCircle ||
        book.circles.some((item) => normalizeText(item) === normalizedCircle);
      return {
        ...book,
        score: Math.min(1, titleScore + (circleMatch ? 0.2 : 0)),
        circleMatch,
      };
    })
    .filter((book) => book.score >= 0.55)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export function createEvent(input: EventInput) {
  const id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .sqlite.prepare(
      `INSERT INTO events
        (id, name, starts_on, ends_on, venue, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.startsOn,
      input.endsOn || null,
      input.venue,
      input.notes,
      now,
      now,
    );
  return getEvent(id);
}

export function updateEvent(id: string, input: EventInput) {
  const result = getDb()
    .sqlite.prepare(
      `UPDATE events SET
        name = ?, starts_on = ?, ends_on = ?, venue = ?, notes = ?,
        updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.name,
      input.startsOn,
      input.endsOn || null,
      input.venue,
      input.notes,
      new Date().toISOString(),
      id,
    );
  return result.changes > 0 ? getEvent(id)! : null;
}

export function getEvent(id: string) {
  return getDb().sqlite
    .prepare(
      `SELECT e.*,
        COUNT(DISTINCT a.book_id) AS book_count,
        COALESCE(SUM(a.quantity), 0) AS total_quantity,
        (SELECT COUNT(*) FROM wishlist_items w WHERE w.event_id = e.id)
          AS wishlist_count,
        (SELECT COUNT(*) FROM wishlist_items w
          WHERE w.event_id = e.id AND w.purchased = 0)
          AS wishlist_remaining_count
       FROM events e
       LEFT JOIN acquisitions a ON a.event_id = e.id
       WHERE e.id = ?
       GROUP BY e.id`,
    )
    .get(id) as
    | {
        id: string;
        name: string;
        starts_on: string;
        ends_on: string | null;
        venue: string;
        notes: string;
        book_count: number;
        total_quantity: number;
        wishlist_count: number;
        wishlist_remaining_count: number;
      }
    | undefined;
}

export function hasWishlistItemsOutsideEventRange(
  eventId: string,
  startsOn: string,
  endsOn: string | null | undefined,
) {
  const row = getDb()
    .sqlite.prepare(
      `SELECT MAX(event_day) AS max_event_day
       FROM wishlist_items
       WHERE event_id = ?`,
    )
    .get(eventId) as { max_event_day: number | null };
  return (
    row.max_event_day !== null &&
    !isEventDayWithinEvent(startsOn, endsOn, row.max_event_day)
  );
}

export function listEvents(limit = 100): EventSummary[] {
  const rows = getDb().sqlite
    .prepare(
      `SELECT e.id, e.name, e.starts_on, e.ends_on, e.venue, e.notes,
        COUNT(DISTINCT a.book_id) AS book_count,
        COALESCE(SUM(a.quantity), 0) AS total_quantity,
        (SELECT COUNT(*) FROM wishlist_items w WHERE w.event_id = e.id)
          AS wishlist_count,
        (SELECT COUNT(*) FROM wishlist_items w
          WHERE w.event_id = e.id AND w.purchased = 0)
          AS wishlist_remaining_count
       FROM events e
       LEFT JOIN acquisitions a ON a.event_id = e.id
       GROUP BY e.id
       ORDER BY e.starts_on DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    name: string;
    starts_on: string;
    ends_on: string | null;
    venue: string;
    notes: string;
    book_count: number;
    total_quantity: number;
    wishlist_count: number;
    wishlist_remaining_count: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    venue: row.venue,
    notes: row.notes,
    bookCount: row.book_count,
    totalQuantity: row.total_quantity,
    wishlistCount: row.wishlist_count,
    wishlistRemainingCount: row.wishlist_remaining_count,
  }));
}

type WishlistItemRow = {
  id: string;
  event_id: string;
  book_id: string | null;
  event_day: number;
  title: string;
  circle: string;
  creators: string;
  fandom_tag_ids: string;
  character_tag_ids: string;
  pairing_tag_ids: string;
  genres: string;
  tags: string;
  adult_rating: "general" | "r18";
  published_on: string | null;
  edition: string;
  cover_path: string | null;
  thumbnail_path: string | null;
  booth: string;
  quantity: number;
  price_yen: number | null;
  notes: string;
  links: string;
  purchased: number;
  created_at: string;
  updated_at: string;
};

function toWishlistItem(row: WishlistItemRow): WishlistItem {
  return {
    id: row.id,
    eventId: row.event_id,
    bookId: row.book_id,
    eventDay: row.event_day,
    title: row.title,
    circle: row.circle,
    creators: row.creators,
    fandomTagIds: parseJson<string[]>(row.fandom_tag_ids, []),
    characterTagIds: parseJson<string[]>(row.character_tag_ids, []),
    pairingTagIds: parseJson<string[]>(row.pairing_tag_ids, []),
    genres: row.genres,
    tags: row.tags,
    adultRating: row.adult_rating,
    publishedOn: row.published_on,
    edition: row.edition,
    coverUrl: row.cover_path ? `/api/media/${row.cover_path}` : null,
    thumbnailUrl: row.thumbnail_path ? `/api/media/${row.thumbnail_path}` : null,
    booth: row.booth,
    quantity: row.quantity,
    priceYen: row.price_yen,
    notes: row.notes,
    links: parseJson<string[]>(row.links, []),
    purchased: Boolean(row.purchased),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateWishlistTaxonomies(
  fandomTagIds: string[],
  characterTagIds: string[],
  pairingTagIds: string[],
) {
  const db = getDb().sqlite;
  for (const id of fandomTagIds) {
    if (!db.prepare("SELECT id FROM tags WHERE id = ? AND type = 'fandom'").get(id)) {
      throw new Error("選択された作品が見つかりません。");
    }
  }
  for (const [type, ids] of [
    ["character", characterTagIds],
    ["pairing", pairingTagIds],
  ] as const) {
    for (const id of ids) {
      const tag = db
        .prepare("SELECT parent_tag_id FROM tags WHERE id = ? AND type = ?")
        .get(id, type) as { parent_tag_id: string | null } | undefined;
      if (!tag) throw new Error("選択された分類が見つかりません。");
      if (tag.parent_tag_id && !fandomTagIds.includes(tag.parent_tag_id)) {
        throw new Error("選択した作品に属さない分類が含まれています。");
      }
    }
  }
}

export function getWishlistItem(id: string) {
  const row = getDb().sqlite
    .prepare("SELECT * FROM wishlist_items WHERE id = ?")
    .get(id) as WishlistItemRow | undefined;
  return row ? toWishlistItem(row) : null;
}

export function listWishlistItems(eventId: string): WishlistItem[] {
  const rows = getDb().sqlite
    .prepare(
      `SELECT * FROM wishlist_items
       WHERE event_id = ?
       ORDER BY purchased ASC, event_day ASC, created_at ASC`,
    )
    .all(eventId) as WishlistItemRow[];
  return rows.map(toWishlistItem);
}

export function createWishlistItem(
  eventId: string,
  rawInput: WishlistItemInput,
  media?: BookMedia | null,
) {
  const input = wishlistItemInputSchema.parse(rawInput);
  const fandomTagIds = splitNames(input.fandomTagIds);
  const characterTagIds = splitNames(input.characterTagIds);
  const pairingTagIds = splitNames(input.pairingTagIds);
  validateWishlistTaxonomies(fandomTagIds, characterTagIds, pairingTagIds);
  const db = getDb().sqlite;
  const event = db
    .prepare("SELECT id, starts_on, ends_on FROM events WHERE id = ?")
    .get(eventId) as
    | { id: string; starts_on: string; ends_on: string | null }
    | undefined;
  if (
    !event ||
    !isEventDayWithinEvent(event.starts_on, event.ends_on, input.eventDay)
  ) {
    return null;
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    db.prepare(
      `INSERT INTO wishlist_items (
        id, event_id, event_day, title, circle, creators, fandom_tag_ids,
        character_tag_ids, pairing_tag_ids, genres, tags, adult_rating,
        published_on, edition, cover_path, thumbnail_path, booth, quantity,
        price_yen, notes, links, purchased, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      eventId,
      input.eventDay,
      input.title,
      input.circle,
      splitNames(input.creators).join("、"),
      JSON.stringify(fandomTagIds),
      JSON.stringify(characterTagIds),
      JSON.stringify(pairingTagIds),
      splitNames(input.genres).join("、"),
      splitNames(input.tags).join("、"),
      input.adultRating,
      input.publishedOn || null,
      input.edition,
      media?.coverPath ?? null,
      media?.thumbnailPath ?? null,
      input.booth,
      input.quantity,
      input.priceYen ?? null,
      input.notes,
      JSON.stringify(input.links ?? []),
      0,
      now,
      now,
    );
    return input.purchased
      ? updateWishlistItem(id, { purchased: true })!
      : getWishlistItem(id)!;
  });
  return transaction();
}

export function updateWishlistItem(
  id: string,
  input: WishlistItemUpdateInput,
  media?: BookMedia | null,
) {
  const current = getWishlistItem(id);
  if (!current) return null;
  const event = getEvent(current.eventId);
  const eventDay = input.eventDay ?? current.eventDay;
  if (
    !event ||
    !isEventDayWithinEvent(event.starts_on, event.ends_on, eventDay)
  ) {
    return null;
  }

  const title = input.title ?? current.title;
  const circle = input.circle ?? current.circle;
  const creators = input.creators === undefined
    ? current.creators
    : splitNames(input.creators).join("、");
  const fandomTagIds = input.fandomTagIds === undefined
    ? current.fandomTagIds
    : splitNames(input.fandomTagIds);
  const characterTagIds = input.characterTagIds === undefined
    ? current.characterTagIds
    : splitNames(input.characterTagIds);
  const pairingTagIds = input.pairingTagIds === undefined
    ? current.pairingTagIds
    : splitNames(input.pairingTagIds);
  validateWishlistTaxonomies(fandomTagIds, characterTagIds, pairingTagIds);
  const genres = input.genres === undefined
    ? current.genres
    : splitNames(input.genres).join("、");
  const tags = input.tags === undefined
    ? current.tags
    : splitNames(input.tags).join("、");
  const adultRating = input.adultRating ?? current.adultRating;
  const publishedOn = input.publishedOn === undefined
    ? current.publishedOn
    : input.publishedOn || null;
  const edition = input.edition ?? current.edition;
  const booth = input.booth ?? current.booth;
  const quantity = input.quantity ?? current.quantity;
  const priceYen =
    input.priceYen === undefined ? current.priceYen : input.priceYen;
  const notes = input.notes ?? current.notes;
  const links = input.links ?? current.links;
  const purchased = input.purchased ?? current.purchased;
  const db = getDb().sqlite;

  if (current.bookId && media !== undefined) {
    throw new Error("購入済みの表紙は蔵書編集画面から変更してください。");
  }
  const currentMedia = getWishlistItemMedia(id);
  const nextMedia = media === undefined ? currentMedia : media;

  const transaction = db.transaction(() => {
    let bookId = current.bookId;
    if (purchased && !bookId) {
      const acquisitionNotes = [
        booth ? `配置: ${booth}` : "",
      ].filter(Boolean).join("\n");
      const book = createBook({
        title,
        circles: circle,
        creators,
        fandoms: "",
        characters: "",
        pairings: "",
        fandomTagIds,
        characterTagIds,
        pairingTagIds,
        genres,
        tags,
        adultRating,
        publishedOn: publishedOn ?? "",
        edition,
        storageLocationId: null,
        storageLocation: "",
        readStatus: "unread",
        ownershipStatus: "owned",
        favorite: false,
        notes,
        links,
        eventId: current.eventId,
        purchasedOn:
          eventDateForDay(event.starts_on, eventDay) ?? event.starts_on,
        priceYen,
        quantity,
        acquisitionNotes,
      }, nextMedia);
      bookId = book.id;
    }

    db.prepare(
      `UPDATE wishlist_items SET
        book_id = ?, event_day = ?, title = ?, circle = ?, creators = ?,
        fandom_tag_ids = ?, character_tag_ids = ?, pairing_tag_ids = ?,
        genres = ?, tags = ?, adult_rating = ?, published_on = ?, edition = ?,
        cover_path = ?, thumbnail_path = ?, booth = ?, quantity = ?,
        price_yen = ?, notes = ?, links = ?, purchased = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      bookId,
      eventDay,
      title,
      circle,
      creators,
      JSON.stringify(fandomTagIds),
      JSON.stringify(characterTagIds),
      JSON.stringify(pairingTagIds),
      genres,
      tags,
      adultRating,
      publishedOn,
      edition,
      nextMedia?.coverPath ?? null,
      nextMedia?.thumbnailPath ?? null,
      booth,
      quantity,
      priceYen,
      notes,
      JSON.stringify(links),
      purchased ? 1 : 0,
      new Date().toISOString(),
      id,
    );
    return getWishlistItem(id)!;
  });
  return transaction();
}

export function getWishlistItemMedia(id: string) {
  const row = getDb().sqlite
    .prepare("SELECT cover_path, thumbnail_path FROM wishlist_items WHERE id = ?")
    .get(id) as
    | { cover_path: string | null; thumbnail_path: string | null }
    | undefined;
  if (!row || !row.cover_path || !row.thumbnail_path) return null;
  return { coverPath: row.cover_path, thumbnailPath: row.thumbnail_path };
}

export function getWishlistItemMediaPaths(id: string) {
  const media = getWishlistItemMedia(id);
  return media ? [media.coverPath, media.thumbnailPath] : [];
}

export function deleteWishlistItem(id: string) {
  return (
    getDb().sqlite.prepare("DELETE FROM wishlist_items WHERE id = ?").run(id)
      .changes > 0
  );
}

export function dashboardStats() {
  const db = getDb().sqlite;
  const counts = db
    .prepare(
      `SELECT
        COUNT(*) AS books,
        COALESCE(SUM(CASE WHEN read_status = 'unread' THEN 1 ELSE 0 END), 0) AS unread,
        COALESCE(SUM(CASE WHEN favorite = 1 THEN 1 ELSE 0 END), 0) AS favorites
       FROM books
       WHERE ownership_status = 'owned'`,
    )
    .get() as { books: number; unread: number; favorites: number };
  const quantities = db
    .prepare(
      `SELECT COALESCE(SUM(a.quantity), 0) AS copies
       FROM acquisitions a
       JOIN books b ON b.id = a.book_id
       WHERE b.ownership_status = 'owned'`,
    )
    .get() as { copies: number };
  return { ...counts, copies: quantities.copies };
}

export function listStorageLocations() {
  return getDb().sqlite
    .prepare(
      `SELECT id, name, parent_id AS parentId, notes
       FROM storage_locations ORDER BY name`,
    )
    .all() as Array<{
    id: string;
    name: string;
    parentId: string | null;
    notes: string;
  }>;
}

export type TaxonomyTag = {
  id: string;
  name: string;
  type: "fandom" | "character" | "pairing";
  parentId: string | null;
  parentName: string | null;
  usageCount: number;
};

const TAXONOMY_TYPES = new Set<TaxonomyTag["type"]>([
  "fandom",
  "character",
  "pairing",
]);

export function listTaxonomyTags(): TaxonomyTag[] {
  return getDb().sqlite
    .prepare(
      `SELECT t.id, t.name, t.type, t.parent_tag_id, parent.name AS parent_name,
              (SELECT COUNT(*) FROM book_tags bt WHERE bt.tag_id = t.id) +
              (SELECT COUNT(*) FROM wishlist_items w
               WHERE EXISTS (SELECT 1 FROM json_each(w.fandom_tag_ids) WHERE value = t.id)
                  OR EXISTS (SELECT 1 FROM json_each(w.character_tag_ids) WHERE value = t.id)
                  OR EXISTS (SELECT 1 FROM json_each(w.pairing_tag_ids) WHERE value = t.id))
                AS usage_count
       FROM tags t
       LEFT JOIN tags parent ON parent.id = t.parent_tag_id
       WHERE t.type IN ('fandom', 'character', 'pairing')
       ORDER BY COALESCE(parent.normalized_name, t.normalized_name),
                CASE t.type WHEN 'fandom' THEN 0 WHEN 'character' THEN 1 ELSE 2 END,
                t.normalized_name`,
    )
    .all()
    .map((row) => {
      const item = row as {
        id: string;
        name: string;
        type: TaxonomyTag["type"];
        parent_tag_id: string | null;
        parent_name: string | null;
        usage_count: number;
      };
      return {
        id: item.id,
        name: item.name,
        type: item.type,
        parentId: item.parent_tag_id,
        parentName: item.parent_name,
        usageCount: item.usage_count,
      };
    });
}

export function createTaxonomyTag(
  name: string,
  type: string,
  parentId: string | null = null,
) {
  const normalizedName = normalizeText(name);
  if (!normalizedName) throw new Error("名称を入力してください。");
  if (name.trim().length > 160) throw new Error("名称は160文字以内で入力してください。");
  if (!TAXONOMY_TYPES.has(type as TaxonomyTag["type"])) {
    throw new Error("分類種別が不正です。");
  }
  if (type === "fandom") {
    parentId = null;
  } else {
    const parent = getDb().sqlite
      .prepare("SELECT id FROM tags WHERE id = ? AND type = 'fandom'")
      .get(parentId) as { id: string } | undefined;
    if (!parent) throw new Error("所属する作品を選択してください。");
  }
  const existing = getDb().sqlite
    .prepare(
      "SELECT id FROM tags WHERE normalized_name = ? AND type = ? AND parent_tag_id IS ?",
    )
    .get(normalizedName, type, parentId) as { id: string } | undefined;
  if (existing) throw new Error("同じ名称がすでに登録されています。");
  const id = randomUUID();
  getDb()
    .sqlite.prepare(
      `INSERT INTO tags
         (id, name, normalized_name, type, parent_tag_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, name.trim(), normalizedName, type, parentId, new Date().toISOString());
  return listTaxonomyTags().find((tag) => tag.id === id)!;
}

export function updateTaxonomyTagParent(id: string, parentId: string) {
  const db = getDb().sqlite;
  const tag = db
    .prepare("SELECT id, type FROM tags WHERE id = ? AND type IN ('character', 'pairing')")
    .get(id) as { id: string; type: "character" | "pairing" } | undefined;
  if (!tag) throw new Error("分類が見つかりません。");
  const parent = db
    .prepare("SELECT id FROM tags WHERE id = ? AND type = 'fandom'")
    .get(parentId) as { id: string } | undefined;
  if (!parent) throw new Error("所属する作品を選択してください。");
  db.prepare("UPDATE tags SET parent_tag_id = ? WHERE id = ?").run(parent.id, tag.id);
  return listTaxonomyTags().find((item) => item.id === id)!;
}

export function deleteTaxonomyTag(id: string) {
  const db = getDb().sqlite;
  const row = db
    .prepare(
      `SELECT t.id,
              (SELECT COUNT(*) FROM book_tags bt WHERE bt.tag_id = t.id) +
              (SELECT COUNT(*) FROM wishlist_items w
               WHERE EXISTS (SELECT 1 FROM json_each(w.fandom_tag_ids) WHERE value = t.id)
                  OR EXISTS (SELECT 1 FROM json_each(w.character_tag_ids) WHERE value = t.id)
                  OR EXISTS (SELECT 1 FROM json_each(w.pairing_tag_ids) WHERE value = t.id))
                AS usage_count
       FROM tags t
       WHERE t.id = ? AND t.type IN ('fandom', 'character', 'pairing')
      `,
    )
    .get(id) as { id: string; usage_count: number } | undefined;
  if (!row) throw new Error("分類が見つかりません。");
  if (row.usage_count > 0) {
    throw new Error("蔵書またはほしいものリストで使用中の分類は削除できません。");
  }
  const child = db
    .prepare("SELECT id FROM tags WHERE parent_tag_id = ? LIMIT 1")
    .get(id) as { id: string } | undefined;
  if (child) throw new Error("子要素が登録されている作品は削除できません。");
  db.prepare("DELETE FROM tags WHERE id = ?").run(id);
}
