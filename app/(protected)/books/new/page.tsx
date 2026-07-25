import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BookForm } from "@/components/book-form";
import { listEvents, listTaxonomyTags } from "@/lib/catalog";

export const metadata = { title: "蔵書を登録" };

export default function NewBookPage() {
  const events = listEvents();
  const taxonomies = listTaxonomyTags();
  return (
    <div className="page-stack narrow-page">
      <Link href="/books" className="back-link"><ChevronLeft size={17} />蔵書一覧へ</Link>
      <header className="page-heading">
        <div>
          <span className="eyebrow">ADD TO COLLECTION</span>
          <h1>蔵書を登録</h1>
          <p>必須なのはタイトルだけ。残りは後から編集できます。</p>
        </div>
      </header>
      <BookForm
        taxonomies={taxonomies}
        events={events.map((event) => ({
          id: event.id,
          name: event.name,
          startsOn: event.startsOn,
        }))}
      />
    </div>
  );
}
