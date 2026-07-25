import Link from "next/link";
import { CalendarPlus, ChevronRight, MapPin } from "lucide-react";
import { listEvents } from "@/lib/catalog";

export const metadata = { title: "イベント" };

export default function EventsPage() {
  const events = listEvents();
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">EVENT LOG</span>
          <h1>イベント</h1>
          <p>イベントごとに購入した本をまとめて振り返れます。</p>
        </div>
        <Link href="/events/new" className="primary-button">
          <CalendarPlus size={18} />イベントを作成
        </Link>
      </header>

      {events.length ? (
        <div className="event-list">
          {events.map((event) => (
            <Link href={`/events/${event.id}/register`} key={event.id} className="event-card">
              <div className="event-date">
                <strong>{new Date(`${event.startsOn}T00:00:00`).getDate()}</strong>
                <span>
                  {new Intl.DateTimeFormat("ja-JP", { month: "short" }).format(
                    new Date(`${event.startsOn}T00:00:00`),
                  )}
                </span>
                <small>{event.startsOn.slice(0, 4)}</small>
              </div>
              <div className="event-card-body">
                <h2>{event.name}</h2>
                <p><MapPin size={15} />{event.venue || "会場未登録"}</p>
                <div>
                  <span>{event.bookCount}タイトル</span>
                  <span>{event.totalQuantity}冊</span>
                </div>
              </div>
              <ChevronRight size={21} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <CalendarPlus size={30} />
          <h2>イベントを作成しましょう</h2>
          <p>イベントを先に作ると、購入品を連続で登録できます。</p>
          <Link href="/events/new" className="primary-button">最初のイベントを作成</Link>
        </div>
      )}
    </div>
  );
}
