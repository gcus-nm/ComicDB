ALTER TABLE wishlist_items ADD COLUMN creators TEXT NOT NULL DEFAULT '';
ALTER TABLE wishlist_items ADD COLUMN fandom_tag_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE wishlist_items ADD COLUMN character_tag_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE wishlist_items ADD COLUMN pairing_tag_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE wishlist_items ADD COLUMN genres TEXT NOT NULL DEFAULT '';
ALTER TABLE wishlist_items ADD COLUMN tags TEXT NOT NULL DEFAULT '';
ALTER TABLE wishlist_items ADD COLUMN adult_rating TEXT NOT NULL DEFAULT 'general'
  CHECK(adult_rating IN ('general', 'r18'));
ALTER TABLE wishlist_items ADD COLUMN published_on TEXT;
ALTER TABLE wishlist_items ADD COLUMN edition TEXT NOT NULL DEFAULT '';
ALTER TABLE wishlist_items ADD COLUMN cover_path TEXT;
ALTER TABLE wishlist_items ADD COLUMN thumbnail_path TEXT;
