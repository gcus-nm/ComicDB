"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Save } from "lucide-react";

type EditableEvent = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string | null;
  venue: string;
  notes: string;
};

export function EventEditForm({ event }: { event: EditableEvent }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(submitEvent: React.FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(submitEvent.currentTarget);

    try {
      const response = await fetch(`/api/events/${event.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-ComicDB-Request": "1",
        },
        body: JSON.stringify(Object.fromEntries(data)),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "イベントを更新できませんでした。");
        return;
      }
      router.push(`/events/${event.id}/register`);
      router.refresh();
    } catch {
      setError("通信に失敗しました。接続を確認してもう一度お試しください。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form-section standalone-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="span-2">
          <span className="field-label">
            イベント名 <b>必須</b>
          </span>
          <input
            name="name"
            required
            maxLength={200}
            autoFocus
            defaultValue={event.name}
          />
        </label>
        <label>
          <span className="field-label">
            開催日 <b>必須</b>
          </span>
          <input
            name="startsOn"
            type="date"
            required
            defaultValue={event.startsOn}
          />
        </label>
        <label>
          終了日
          <input
            name="endsOn"
            type="date"
            defaultValue={event.endsOn ?? ""}
          />
        </label>
        <label className="span-2">
          会場
          <input
            name="venue"
            maxLength={200}
            defaultValue={event.venue}
            placeholder="例：東京ビッグサイト"
          />
        </label>
        <label className="span-2">
          メモ
          <textarea
            name="notes"
            rows={3}
            defaultValue={event.notes}
            placeholder="配置、参加日など"
          />
        </label>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="form-actions">
        <Link
          href={`/events/${event.id}/register`}
          className="secondary-button"
        >
          キャンセル
        </Link>
        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Save size={18} />
          )}
          変更を保存
        </button>
      </div>
    </form>
  );
}
