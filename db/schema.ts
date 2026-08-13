import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("users_username_uq").on(table.username)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_uq").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    key: text("key").primaryKey(),
    attempts: integer("attempts").notNull().default(0),
    firstAttemptAt: text("first_attempt_at").notNull(),
    blockedUntil: text("blocked_until"),
  },
);

export const storageLocations = sqliteTable(
  "storage_locations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("storage_name_parent_uq").on(table.name, table.parentId)],
);

export const books = sqliteTable(
  "books",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    adultRating: text("adult_rating").notNull().default("general"),
    publishedOn: text("published_on"),
    edition: text("edition").notNull().default(""),
    storageLocationId: text("storage_location_id").references(
      () => storageLocations.id,
      { onDelete: "set null" },
    ),
    readStatus: text("read_status").notNull().default("unread"),
    ownershipStatus: text("ownership_status").notNull().default("owned"),
    disposedAt: text("disposed_at"),
    favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
    notes: text("notes").notNull().default(""),
    links: text("links").notNull().default("[]"),
    coverPath: text("cover_path"),
    thumbnailPath: text("thumbnail_path"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("books_normalized_title_idx").on(table.normalizedTitle),
    index("books_ownership_status_idx").on(table.ownershipStatus),
    index("books_updated_idx").on(table.updatedAt),
  ],
);

export const circles = sqliteTable(
  "circles",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("circles_normalized_name_uq").on(table.normalizedName)],
);

export const bookCircles = sqliteTable(
  "book_circles",
  {
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    circleId: text("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    uniqueIndex("book_circles_uq").on(table.bookId, table.circleId),
    index("book_circles_circle_idx").on(table.circleId),
  ],
);

export const creators = sqliteTable(
  "creators",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("creators_normalized_name_uq").on(table.normalizedName)],
);

export const bookCreators = sqliteTable(
  "book_creators",
  {
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    creatorId: text("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("book_creators_uq").on(table.bookId, table.creatorId)],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    type: text("type").notNull().default("custom"),
    parentTagId: text("parent_tag_id"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("tags_root_name_type_uq")
      .on(table.normalizedName, table.type)
      .where(sql`${table.parentTagId} IS NULL`),
    uniqueIndex("tags_child_name_type_parent_uq")
      .on(table.normalizedName, table.type, table.parentTagId)
      .where(sql`${table.parentTagId} IS NOT NULL`),
    index("tags_type_idx").on(table.type),
    index("tags_parent_idx").on(table.parentTagId),
  ],
);

export const bookTags = sqliteTable(
  "book_tags",
  {
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("book_tags_uq").on(table.bookId, table.tagId)],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    startsOn: text("starts_on").notNull(),
    endsOn: text("ends_on"),
    venue: text("venue").notNull().default(""),
    notes: text("notes").notNull().default(""),
    links: text("links").notNull().default("[]"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("events_starts_on_idx").on(table.startsOn)],
);

export const wishlistItems = sqliteTable(
  "wishlist_items",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    bookId: text("book_id").references(() => books.id, {
      onDelete: "set null",
    }),
    eventDay: integer("event_day").notNull().default(1),
    title: text("title").notNull(),
    circle: text("circle").notNull().default(""),
    creators: text("creators").notNull().default(""),
    fandomTagIds: text("fandom_tag_ids").notNull().default("[]"),
    characterTagIds: text("character_tag_ids").notNull().default("[]"),
    pairingTagIds: text("pairing_tag_ids").notNull().default("[]"),
    genres: text("genres").notNull().default(""),
    tags: text("tags").notNull().default(""),
    adultRating: text("adult_rating").notNull().default("general"),
    publishedOn: text("published_on"),
    edition: text("edition").notNull().default(""),
    coverPath: text("cover_path"),
    thumbnailPath: text("thumbnail_path"),
    booth: text("booth").notNull().default(""),
    quantity: integer("quantity").notNull().default(1),
    priceYen: integer("price_yen"),
    notes: text("notes").notNull().default(""),
    links: text("links").notNull().default("[]"),
    purchased: integer("purchased", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("wishlist_items_event_idx").on(table.eventId),
    index("wishlist_items_book_idx").on(table.bookId),
    index("wishlist_items_event_purchased_idx").on(
      table.eventId,
      table.purchased,
    ),
  ],
);

export const acquisitions = sqliteTable(
  "acquisitions",
  {
    id: text("id").primaryKey(),
    bookId: text("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    eventId: text("event_id").references(() => events.id, {
      onDelete: "set null",
    }),
    purchasedOn: text("purchased_on"),
    priceYen: integer("price_yen"),
    quantity: integer("quantity").notNull().default(1),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("acquisitions_book_idx").on(table.bookId),
    index("acquisitions_event_idx").on(table.eventId),
  ],
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const googleIntegrations = sqliteTable("google_integrations", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  googleSubject: text("google_subject").notNull(),
  googleEmail: text("google_email").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  grantedScopes: text("granted_scopes").notNull(),
  spreadsheetId: text("spreadsheet_id"),
  spreadsheetName: text("spreadsheet_name"),
  sheetId: integer("sheet_id"),
  sheetTitle: text("sheet_title"),
  lastPushAt: text("last_push_at"),
  lastPullAt: text("last_pull_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const googleOauthStates = sqliteTable(
  "google_oauth_states",
  {
    stateHash: text("state_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("google_oauth_states_expires_idx").on(table.expiresAt)],
);

export const apiAuditLogs = sqliteTable(
  "api_audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    at: text("at").notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    result: text("result").notNull(),
    detail: text("detail").notNull().default(""),
  },
  (table) => [index("api_audit_logs_at_idx").on(table.at)],
);

export const apiIdempotencyRecords = sqliteTable(
  "api_idempotency_records",
  {
    actor: text("actor").notNull(),
    keyHash: text("key_hash").notNull(),
    scope: text("scope").notNull(),
    requestHash: text("request_hash").notNull(),
    status: integer("status").notNull(),
    responseJson: text("response_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("api_idempotency_actor_key_uq").on(table.actor, table.keyHash),
    index("api_idempotency_created_at_idx").on(table.createdAt),
  ],
);
