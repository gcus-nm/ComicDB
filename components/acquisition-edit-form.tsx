"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Save } from "lucide-react";
import type { BookDetail } from "@/lib/types";

type Acquisition = BookDetail["acquisitions"][number];
type SelectableEvent = { id: string; name: string; startsOn: string };

export function AcquisitionEditForm({
  bookId,
  acquisition,
  events,
}: {
  bookId: string;
  acquisition: Acquisition;
  events: SelectableEvent[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const response = await fetch(
      `/api/books/${bookId}/acquisitions/${acquisition.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-ComicDB-Request": "1",
        },
        body: JSON.stringify({
          eventId: data.get("eventId") || null,
          purchasedOn: data.get("purchasedOn") || "",
          priceYen: data.get("priceYen") || null,
          quantity: data.get("quantity") || 1,
          notes: data.get("notes") || "",
        }),
      },
    );
    const body = (await response.json()) as { error?: string };
    setMessage(
      response.ok
        ? "購入情報を保存しました。"
        : (body.error ?? "購入情報を保存できませんでした。"),
    );
    setPending(false);
    if (response.ok) router.refresh();
  }

  return (
    <details className="acquisition-edit-panel">
      <summary>購入情報を編集</summary>
      <form className="form-grid acquisition-edit-form" onSubmit={submit}>
        <label>
          購入イベント
          <select name="eventId" defaultValue={acquisition.eventId ?? ""}>
            <option value="">イベント未指定</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.startsOn}　{event.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          購入日
          <input
            name="purchasedOn"
            type="date"
            defaultValue={acquisition.purchasedOn ?? ""}
          />
        </label>
        <label>
          購入価格
          <div className="input-with-suffix">
            <input
              name="priceYen"
              type="number"
              min="0"
              inputMode="numeric"
              defaultValue={acquisition.priceYen ?? ""}
            />
            <span>円</span>
          </div>
        </label>
        <label>
          数量
          <input
            name="quantity"
            type="number"
            min="1"
            max="99"
            inputMode="numeric"
            defaultValue={acquisition.quantity}
          />
        </label>
        <label className="span-2">
          購入メモ
          <input name="notes" defaultValue={acquisition.notes} />
        </label>
        {message ? (
          <p className="span-2 inline-message" role="status">
            {message}
          </p>
        ) : null}
        <button className="secondary-button span-2" type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
          購入情報を保存
        </button>
      </form>
    </details>
  );
}
