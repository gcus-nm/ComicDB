import { Grid2X2, List, Search, SlidersHorizontal } from "lucide-react";
import type { EventSummary } from "@/lib/types";

export function BookFilters({
  query,
  events,
  view,
}: {
  query: Record<string, string | undefined>;
  events: EventSummary[];
  view: "grid" | "list";
}) {
  return (
    <form className="filter-panel" action="/books">
      <div className="filter-search">
        <Search size={18} />
        <input
          name="q"
          defaultValue={query.q}
          placeholder="タイトル・サークル・作者・原作"
          aria-label="検索語"
        />
      </div>
      <div className="filter-row">
        <span className="filter-label">
          <SlidersHorizontal size={16} />
          絞り込み
        </span>
        <select name="adultRating" defaultValue={query.adultRating ?? ""} aria-label="成人区分">
          <option value="">全年齢区分</option>
          <option value="general">全年齢</option>
          <option value="r18">R18</option>
        </select>
        <select name="readStatus" defaultValue={query.readStatus ?? ""} aria-label="読了状態">
          <option value="">読了状態</option>
          <option value="unread">未読</option>
          <option value="reading">読書中</option>
          <option value="read">読了</option>
        </select>
        <select name="eventId" defaultValue={query.eventId ?? ""} aria-label="購入イベント">
          <option value="">すべてのイベント</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>{event.name}</option>
          ))}
        </select>
        <label className="check-chip">
          <input type="checkbox" name="favorite" value="true" defaultChecked={query.favorite === "true"} />
          お気に入り
        </label>
        <input type="hidden" name="view" value={view} />
        <button className="secondary-button small" type="submit">適用</button>
        <div className="view-switch" aria-label="表示形式">
          <a
            href={`/books?${new URLSearchParams({ ...query, view: "grid" } as Record<string, string>)}`}
            aria-label="グリッド表示"
            aria-current={view === "grid" ? "page" : undefined}
          >
            <Grid2X2 size={17} />
          </a>
          <a
            href={`/books?${new URLSearchParams({ ...query, view: "list" } as Record<string, string>)}`}
            aria-label="一覧表示"
            aria-current={view === "list" ? "page" : undefined}
          >
            <List size={18} />
          </a>
        </div>
      </div>
    </form>
  );
}
