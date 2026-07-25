import Link from "next/link";
import {
  ArrowRight,
  BookPlus,
  CalendarPlus,
  Heart,
  Search,
  Sparkles,
} from "lucide-react";
import { BookCard } from "@/components/book-card";
import { dashboardStats, listBooks, listEvents } from "@/lib/catalog";

export const metadata = { title: "ホーム" };

export default function DashboardPage() {
  const stats = dashboardStats();
  const recentBooks = listBooks({ limit: 6 }).books;
  const recentEvents = listEvents(3);

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">PRIVATE COLLECTION</span>
          <h1>あの本、持ってたっけ？</h1>
          <p>タイトル、サークル、作者、原作からすぐに所持確認できます。</p>
        </div>
        <form action="/books" className="hero-search">
          <Search size={21} aria-hidden="true" />
          <input name="q" placeholder="タイトル・サークル・作者で検索" aria-label="蔵書検索" />
          <button type="submit">検索</button>
        </form>
        <div className="hero-actions">
          <Link href="/books/new" className="primary-button">
            <BookPlus size={18} />
            蔵書を登録
          </Link>
          <Link href="/events/new" className="secondary-button">
            <CalendarPlus size={18} />
            イベントを作成
          </Link>
        </div>
      </section>

      <section className="stats-grid" aria-label="蔵書集計">
        <article>
          <small>登録タイトル</small>
          <strong>{stats.books.toLocaleString()}</strong>
          <span>titles</span>
        </article>
        <article>
          <small>所持冊数</small>
          <strong>{stats.copies.toLocaleString()}</strong>
          <span>copies</span>
        </article>
        <article>
          <small>未読</small>
          <strong>{stats.unread.toLocaleString()}</strong>
          <span>unread</span>
        </article>
        <article>
          <small>お気に入り</small>
          <strong>{stats.favorites.toLocaleString()}</strong>
          <Heart size={18} />
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">RECENTLY ADDED</span>
            <h2>最近追加した本</h2>
          </div>
          <Link href="/books" className="text-link">
            すべて見る <ArrowRight size={16} />
          </Link>
        </div>
        {recentBooks.length ? (
          <div className="book-grid">
            {recentBooks.map((book) => <BookCard key={book.id} book={book} />)}
          </div>
        ) : (
          <div className="empty-state">
            <Sparkles size={28} />
            <h3>最初の1冊を登録しましょう</h3>
            <p>イベントから登録すると、購入履歴も一緒に残せます。</p>
            <Link href="/books/new" className="primary-button">蔵書を登録</Link>
          </div>
        )}
      </section>

      {recentEvents.length ? (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">EVENT LOG</span>
              <h2>最近のイベント</h2>
            </div>
            <Link href="/events" className="text-link">
              イベント一覧 <ArrowRight size={16} />
            </Link>
          </div>
          <div className="event-strip">
            {recentEvents.map((event) => (
              <Link key={event.id} href={`/events/${event.id}/register`} className="event-mini-card">
                <time>{event.startsOn.replaceAll("-", ".")}</time>
                <h3>{event.name}</h3>
                <p>{event.venue || "会場未登録"}</p>
                <span>{event.totalQuantity}冊登録</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
