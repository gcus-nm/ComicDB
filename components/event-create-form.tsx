"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, LoaderCircle } from "lucide-react";

export function EventCreateForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ComicDB-Request": "1",
      },
      body: JSON.stringify(Object.fromEntries(data)),
    });
    const body = (await response.json()) as { id?: string; error?: string };
    if (!response.ok) {
      setError(body.error ?? "イベントを作成できませんでした。");
      setPending(false);
      return;
    }
    router.push(`/events/${body.id}/register`);
    router.refresh();
  }

  return (
    <form className="form-section standalone-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="span-2">
          <span className="field-label">
            イベント名 <b>必須</b>
          </span>
          <input name="name" required maxLength={200} autoFocus placeholder="例：コミックマーケット108" />
        </label>
        <label>
          <span className="field-label">
            開催日 <b>必須</b>
          </span>
          <input name="startsOn" type="date" required />
        </label>
        <label>
          終了日
          <input name="endsOn" type="date" />
        </label>
        <label className="span-2">
          会場
          <input name="venue" maxLength={200} placeholder="例：東京ビッグサイト" />
        </label>
        <label className="span-2">
          メモ
          <textarea name="notes" rows={3} placeholder="配置、参加日など" />
        </label>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="primary-button large" type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={19} /> : <CalendarPlus size={19} />}
        作成して購入品を登録
      </button>
    </form>
  );
}
