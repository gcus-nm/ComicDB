import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookPlus,
  CalendarDays,
  ChevronLeft,
  MapPin,
  Pencil,
} from "lucide-react";
import { WishlistManager } from "@/components/wishlist-manager";
import { ExternalLinks } from "@/components/external-links";
import { getEvent, listTaxonomyTags, listWishlistItems } from "@/lib/catalog";
import { formatEventDateRange } from "@/lib/event-dates";

export const metadata = { title: "イベントのほしいものリスト" };

export default async function EventWishlistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = getEvent(id);
  if (!event) notFound();
  const items = listWishlistItems(id);
  const taxonomies = listTaxonomyTags();

  return (
    <div className="page-stack narrow-page wishlist-page">
      <Link href="/wishlist" className="back-link">
        <ChevronLeft size={17} />
        ほしいものリスト一覧へ
      </Link>
      <section className="event-register-header wishlist-event-header">
        <div className="event-badge">
          <CalendarDays size={24} />
        </div>
        <div className="event-header-copy">
          <span className="eyebrow">EVENT WISHLIST</span>
          <h1>{event.name}</h1>
          <p>
            {formatEventDateRange(event.starts_on, event.ends_on)}
            {event.venue ? (
              <>
                <span>·</span>
                <MapPin size={14} />
                {event.venue}
              </>
            ) : null}
          </p>
          <ExternalLinks links={event.links} />
        </div>
        <div className="event-header-actions">
          <Link
            href={`/events/${event.id}/edit`}
            className="secondary-button"
          >
            <Pencil size={17} />
            イベント編集
          </Link>
          <Link
            href={`/events/${event.id}/register`}
            className="secondary-button wishlist-register-link"
          >
            <BookPlus size={17} />
            購入品を登録
          </Link>
        </div>
      </section>
      <WishlistManager
        eventId={event.id}
        startsOn={event.starts_on}
        endsOn={event.ends_on}
        initialItems={items}
        taxonomies={taxonomies}
      />
    </div>
  );
}
