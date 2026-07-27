ALTER TABLE events
  ADD COLUMN wishlist_day INTEGER NOT NULL DEFAULT 1
  CHECK(wishlist_day >= 1);
