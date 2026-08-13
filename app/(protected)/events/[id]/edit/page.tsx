import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { EventEditForm } from "@/components/event-edit-form";
import { getEvent } from "@/lib/catalog";

export const metadata = { title: "イベントを編集" };

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = getEvent(id);
  if (!event) notFound();

  return (
    <div className="page-stack narrow-page">
      <Link href={`/events/${event.id}/register`} className="back-link">
        <ChevronLeft size={17} />
        イベントへ戻る
      </Link>
      <header className="page-heading">
        <div>
          <span className="eyebrow">EDIT EVENT</span>
          <h1>イベントを編集</h1>
          <p>イベント名、開催日、会場、関連リンク、メモを変更できます。</p>
        </div>
      </header>
      <EventEditForm
        event={{
          id: event.id,
          name: event.name,
          startsOn: event.starts_on,
          endsOn: event.ends_on,
          venue: event.venue,
          notes: event.notes,
          links: event.links,
        }}
      />
    </div>
  );
}
