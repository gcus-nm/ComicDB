CREATE TABLE wishlist_items (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  circle TEXT NOT NULL DEFAULT '',
  booth TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  price_yen INTEGER CHECK(price_yen IS NULL OR price_yen >= 0),
  notes TEXT NOT NULL DEFAULT '',
  purchased INTEGER NOT NULL DEFAULT 0 CHECK(purchased IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX wishlist_items_event_idx
  ON wishlist_items(event_id);

CREATE INDEX wishlist_items_event_purchased_idx
  ON wishlist_items(event_id, purchased);
