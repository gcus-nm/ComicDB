import Link from "next/link";
import { Heart, MapPin } from "lucide-react";
import type { BookSummary } from "@/lib/types";
import { BookCover } from "./book-cover";

export function BookCard({ book, compact = false }: { book: BookSummary; compact?: boolean }) {
  return (
    <Link
      href={`/books/${book.id}`}
      className={`book-card ${compact ? "compact" : ""} ${book.ownershipStatus === "disposed" ? "disposed" : ""}`}
    >
      <BookCover
        src={book.thumbnailUrl}
        title={book.title}
        adultRating={book.adultRating}
      />
      <div className="book-card-body">
        <div className="book-title-line">
          <h3>{book.title}</h3>
          {book.favorite ? <Heart size={16} fill="currentColor" aria-label="お気に入り" /> : null}
        </div>
        <p>{book.circles.join(" / ") || "サークル未登録"}</p>
        <div className="book-meta-row">
          <span className={book.ownershipStatus === "disposed" ? "disposed-label" : ""}>
            {book.ownershipStatus === "disposed" ? "処分済み" : `${book.ownedCount || 1}冊所持`}
          </span>
          {book.storageLocation ? (
            <span>
              <MapPin size={13} />
              {book.storageLocation}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
