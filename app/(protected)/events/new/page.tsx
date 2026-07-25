import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { EventCreateForm } from "@/components/event-create-form";

export const metadata = { title: "イベントを作成" };

export default function NewEventPage() {
  return (
    <div className="page-stack narrow-page">
      <Link href="/events" className="back-link"><ChevronLeft size={17} />イベント一覧へ</Link>
      <header className="page-heading">
        <div>
          <span className="eyebrow">NEW EVENT</span>
          <h1>イベントを作成</h1>
          <p>作成後、そのイベントで購入した本を続けて入力できます。</p>
        </div>
      </header>
      <EventCreateForm />
    </div>
  );
}
