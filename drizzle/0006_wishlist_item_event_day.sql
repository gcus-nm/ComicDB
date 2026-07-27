ALTER TABLE wishlist_items
  ADD COLUMN event_day INTEGER NOT NULL DEFAULT 1
  CHECK(event_day >= 1);

UPDATE wishlist_items
SET event_day = COALESCE(
  (
    SELECT events.wishlist_day
    FROM events
    WHERE events.id = wishlist_items.event_id
  ),
  1
);

ALTER TABLE events DROP COLUMN wishlist_day;
