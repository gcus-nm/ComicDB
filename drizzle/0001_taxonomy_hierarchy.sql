CREATE TABLE tags_v2 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom'
    CHECK(type IN ('fandom', 'character', 'pairing', 'genre', 'custom')),
  parent_tag_id TEXT REFERENCES tags_v2(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  CHECK(type IN ('character', 'pairing') OR parent_tag_id IS NULL)
);

INSERT INTO tags_v2 (id, name, normalized_name, type, parent_tag_id, created_at)
SELECT id, name, normalized_name, type, NULL, created_at
FROM tags;

CREATE TABLE book_tags_v2 (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags_v2(id) ON DELETE CASCADE,
  PRIMARY KEY(book_id, tag_id)
);

INSERT INTO book_tags_v2 (book_id, tag_id)
SELECT book_id, tag_id
FROM book_tags;

DROP TABLE book_tags;
DROP TABLE tags;
ALTER TABLE tags_v2 RENAME TO tags;
ALTER TABLE book_tags_v2 RENAME TO book_tags;

CREATE INDEX tags_type_idx ON tags(type);
CREATE INDEX tags_parent_idx ON tags(parent_tag_id);
CREATE UNIQUE INDEX tags_root_name_type_uq
  ON tags(normalized_name, type) WHERE parent_tag_id IS NULL;
CREATE UNIQUE INDEX tags_child_name_type_parent_uq
  ON tags(normalized_name, type, parent_tag_id) WHERE parent_tag_id IS NOT NULL;
CREATE INDEX book_tags_tag_idx ON book_tags(tag_id);
