"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, CloudOff, Search } from "lucide-react";
import { readOfflineSnapshot, type OfflineSnapshot } from "@/lib/offline-client";
import { normalizeSearchText } from "@/lib/normalize";
import { BookCover } from "./book-cover";

export function OfflineCatalog() {
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    void readOfflineSnapshot().then(setSnapshot);
  }, []);
  const books = useMemo(() => {
    if (!snapshot) return [];
    const normalized = normalizeSearchText(query);
    if (!normalized) return snapshot.books;
    return snapshot.books.filter((book) =>
      normalizeSearchText(
        [book.title, ...book.circles, ...book.creators, ...book.tags.map((tag) => tag.name)].join(" "),
      ).includes(normalized),
    );
  }, [query, snapshot]);

  if (!snapshot) {
    return (
      <div className="empty-state">
        <CloudOff size={30} />
        <h2>オフラインデータがありません</h2>
        <p>オンライン時に設定画面から蔵書を端末へ保存してください。</p>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="offline-banner">
        <CloudOff size={18} />
        読み取り専用 · 最終更新 {new Date(snapshot.generatedAt).toLocaleString("ja-JP")}
      </div>
      <div className="filter-search offline-search">
        <Search size={19} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="保存済みの蔵書を検索" autoFocus />
      </div>
      <p className="result-count">{books.length}タイトル</p>
      <div className="book-grid collection-grid offline-grid">
        {books.map((book) => (
          <article key={book.id} className="book-card offline-card">
            <BookCover src={book.thumbnailUrl} title={book.title} adultRating={book.adultRating} />
            <div className="book-card-body">
              <h3>{book.title}</h3>
              <p>{book.circles.join(" / ") || "サークル未登録"}</p>
              <div className="book-meta-row">
                <span className={book.ownershipStatus === "disposed" ? "disposed-label" : ""}>
                  {book.ownershipStatus === "disposed" ? "処分済み" : `${book.ownedCount}冊所持`}
                </span>
                <span>{book.storageLocation}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!books.length ? (
        <div className="empty-state"><BookOpen size={28} /><h2>見つかりませんでした</h2></div>
      ) : null}
    </div>
  );
}
