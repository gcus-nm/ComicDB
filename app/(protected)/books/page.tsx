import Link from "next/link";
import { BookPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { BookCard } from "@/components/book-card";
import { BookFilters } from "@/components/book-filters";
import { listBooks, listEvents } from "@/lib/catalog";

export const metadata = { title: "蔵書一覧" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BooksPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const query = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  ) as Record<string, string | undefined>;
  const view = query.view === "list" ? "list" : "grid";
  const result = listBooks({
    q: query.q,
    adultRating: query.adultRating,
    readStatus: query.readStatus,
    ownershipStatus: query.ownershipStatus,
    favorite: query.favorite === "true",
    eventId: query.eventId,
    page: Number(query.page ?? 1),
  });
  const events = listEvents();
  const pageHref = (page: number) => {
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(query).filter(([, value]) => value)) as Record<string, string>,
    );
    params.set("page", String(page));
    return `/books?${params}`;
  };

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">COLLECTION</span>
          <h1>蔵書一覧</h1>
          <p>{result.total.toLocaleString()}タイトルを登録中</p>
        </div>
        <Link href="/books/new" className="primary-button">
          <BookPlus size={18} />
          蔵書を登録
        </Link>
      </header>
      <BookFilters query={query} events={events} view={view} />

      {result.books.length ? (
        <div className={view === "list" ? "book-list" : "book-grid collection-grid"}>
          {result.books.map((book) => (
            <BookCard key={book.id} book={book} compact={view === "list"} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>該当する本がありません</h2>
          <p>検索語や絞り込みを変えてみてください。</p>
          <Link href="/books" className="secondary-button">条件をクリア</Link>
        </div>
      )}

      {result.pages > 1 ? (
        <nav className="pagination" aria-label="ページ移動">
          {result.page > 1 ? (
            <Link href={pageHref(result.page - 1)}><ChevronLeft size={18} />前へ</Link>
          ) : <span />}
          <span>{result.page} / {result.pages}</span>
          {result.page < result.pages ? (
            <Link href={pageHref(result.page + 1)}>次へ<ChevronRight size={18} /></Link>
          ) : <span />}
        </nav>
      ) : null}
    </div>
  );
}
