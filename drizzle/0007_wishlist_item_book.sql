ALTER TABLE wishlist_items
  ADD COLUMN book_id TEXT REFERENCES books(id) ON DELETE SET NULL;

CREATE INDEX wishlist_items_book_idx
  ON wishlist_items(book_id);
