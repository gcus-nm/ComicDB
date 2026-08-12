import { notFound } from "next/navigation";
import Link from "next/link";
import {
  BookMarked,
  CalendarDays,
  ChevronLeft,
  Heart,
  MapPin,
  Tag,
  Users,
} from "lucide-react";
import { BookCover } from "@/components/book-cover";
import { BookEditForm } from "@/components/book-edit-form";
import { BookLifecycleActions } from "@/components/book-lifecycle-actions";
import { ExternalLinks } from "@/components/external-links";
import { getBook, listTaxonomyTags } from "@/lib/catalog";

export const metadata = { title: "蔵書詳細" };

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const book = getBook(id);
  if (!book) notFound();
  const taxonomies = listTaxonomyTags();

  return (
    <div className="page-stack narrow-page">
      <Link href="/books" className="back-link"><ChevronLeft size={17} />蔵書一覧へ</Link>
      <section className="book-detail">
        <BookCover src={book.coverUrl} title={book.title} adultRating={book.adultRating} className="detail-cover" />
        <div className="book-detail-main">
          <div className="detail-badges">
            <span>{book.adultRating === "r18" ? "R18" : "全年齢"}</span>
            <span>{book.readStatus === "read" ? "読了" : book.readStatus === "reading" ? "読書中" : "未読"}</span>
            <span className={book.ownershipStatus === "disposed" ? "disposed-badge" : ""}>
              {book.ownershipStatus === "disposed" ? "処分済み" : "所持中"}
            </span>
            {book.favorite ? <span className="favorite-badge"><Heart size={14} fill="currentColor" />お気に入り</span> : null}
          </div>
          <h1>{book.title}</h1>
          <p className="detail-circle">{book.circles.join(" / ") || "サークル未登録"}</p>
          <dl className="detail-list">
            <div><dt><Users size={16} />作者</dt><dd>{book.creators.join(" / ") || "未登録"}</dd></div>
            <div><dt><MapPin size={16} />保管場所</dt><dd>{book.storageLocation || "未登録"}</dd></div>
            <div>
              <dt><BookMarked size={16} />{book.ownershipStatus === "disposed" ? "購入記録" : "所持数"}</dt>
              <dd>{book.ownedCount || 1}冊</dd>
            </div>
            <div><dt><CalendarDays size={16} />発行日</dt><dd>{book.publishedOn || "未登録"}</dd></div>
          </dl>
          {book.tags.length ? (
            <div className="tag-list">
              <Tag size={15} />
              {book.tags.map((tag) => <span key={`${tag.type}-${tag.name}`}>{tag.name}</span>)}
            </div>
          ) : null}
          <ExternalLinks links={book.links} />
          {book.notes ? <p className="detail-notes">{book.notes}</p> : null}
        </div>
      </section>

      <BookEditForm book={book} taxonomies={taxonomies} />

      <section className="section-block">
        <div className="section-heading">
          <div><span className="eyebrow">ACQUISITIONS</span><h2>購入履歴</h2></div>
        </div>
        {book.acquisitions.length ? (
          <div className="history-list">
            {book.acquisitions.map((item) => (
              <article key={item.id}>
                <div className="history-dot" />
                <div>
                  <time>{item.purchasedOn?.replaceAll("-", ".") || "日付未登録"}</time>
                  <h3>{item.eventName || "イベント未設定"}</h3>
                  <p>{item.quantity}冊{item.priceYen != null ? ` · ${item.priceYen.toLocaleString()}円` : ""}</p>
                  {item.notes ? <small>{item.notes}</small> : null}
                </div>
              </article>
            ))}
          </div>
        ) : <p className="muted">購入履歴はまだありません。</p>}
      </section>

      <BookLifecycleActions
        bookId={book.id}
        title={book.title}
        ownershipStatus={book.ownershipStatus}
      />
    </div>
  );
}
