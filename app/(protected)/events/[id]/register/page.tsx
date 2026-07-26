import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ListChecks,
  MapPin,
} from "lucide-react";
import { BookCard } from "@/components/book-card";
import { BookForm } from "@/components/book-form";
import { getEvent, listBooks, listTaxonomyTags } from "@/lib/catalog";

export const metadata = { title: "イベント連続登録" };

export default async function EventRegisterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = getEvent(id);
  if (!event) notFound();
  const recent = listBooks({ eventId: id, limit: 8 }).books;
  const taxonomies = listTaxonomyTags();

  return (
    <div className="page-stack narrow-page">
      <Link href="/events" className="back-link"><ChevronLeft size={17} />イベント一覧へ</Link>
      <section className="event-register-header">
        <div className="event-badge"><CalendarDays size={24} /></div>
        <div>
          <span className="eyebrow">QUICK REGISTER</span>
          <h1>{event.name}</h1>
          <p>
            {event.starts_on.replaceAll("-", ".")}
            {event.venue ? <><span>·</span><MapPin size={14} />{event.venue}</> : null}
          </p>
        </div>
        <Link
          href={`/events/${event.id}/wishlist`}
          className="secondary-button wishlist-register-link"
        >
          <ListChecks size={17} />
          ほしいものリスト
        </Link>
      </section>
      <BookForm
        event={{ id: event.id, name: event.name, startsOn: event.starts_on }}
        taxonomies={taxonomies}
        continuous
      />
      {recent.length ? (
        <section className="section-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">REGISTERED</span>
              <h2>このイベントの登録済み</h2>
            </div>
          </div>
          <div className="book-list">
            {recent.map((book) => <BookCard key={book.id} book={book} compact />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
