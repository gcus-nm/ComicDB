import Link from "next/link";
import {
  CalendarPlus,
  ChevronRight,
  ListChecks,
  MapPin,
} from "lucide-react";
import { listEvents } from "@/lib/catalog";
import { formatEventDateRange } from "@/lib/event-dates";

export const metadata = { title: "ほしいものリスト" };

export default function WishlistPage() {
  const events = listEvents();

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">EVENT WISHLISTS</span>
          <h1>ほしいものリスト</h1>
          <p>イベントを選んで、買いたい本やグッズをまとめて確認できます。</p>
        </div>
        <Link href="/events/new" className="secondary-button">
          <CalendarPlus size={18} />
          イベントを作成
        </Link>
      </header>

      {events.length ? (
        <div className="wishlist-event-list">
          {events.map((event) => (
            <Link
              href={`/events/${event.id}/wishlist`}
              key={event.id}
              className="wishlist-event-card"
            >
              <span className="wishlist-event-icon">
                <ListChecks size={22} />
              </span>
              <div className="wishlist-event-body">
                <time>
                  {formatEventDateRange(event.startsOn, event.endsOn)}
                </time>
                <h2>{event.name}</h2>
                <p>
                  <MapPin size={14} />
                  {event.venue || "会場未登録"}
                </p>
              </div>
              <div className="wishlist-event-status">
                {event.wishlistCount ? (
                  <>
                    <strong>{event.wishlistRemainingCount}</strong>
                    <span>未購入 / 全{event.wishlistCount}件</span>
                  </>
                ) : (
                  <span>リスト未作成</span>
                )}
              </div>
              <ChevronRight size={20} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <ListChecks size={30} />
          <h2>イベントを先に作成しましょう</h2>
          <p>ほしいものリストはイベントごとに作成します。</p>
          <Link href="/events/new" className="primary-button">
            最初のイベントを作成
          </Link>
        </div>
      )}
    </div>
  );
}
