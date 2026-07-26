"use client";

import { useState } from "react";
import { CalendarPlus, LoaderCircle } from "lucide-react";

export type SelectableEvent = {
  id: string;
  name: string;
  startsOn: string;
};

export function EventQuickCreate({
  onCreated,
}: {
  onCreated: (event: SelectableEvent) => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  function close() {
    setIsCreating(false);
    setMessage("");
  }

  async function create() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setMessage("イベント名を入力してください。");
      return;
    }
    if (!startsOn) {
      setMessage("開催日を入力してください。");
      return;
    }

    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ComicDB-Request": "1",
        },
        body: JSON.stringify({
          name: trimmedName,
          startsOn,
          endsOn: "",
          venue: "",
          notes: "",
        }),
      });
      const body = (await response.json()) as {
        id?: string;
        name?: string;
        starts_on?: string;
        error?: string;
      };
      if (!response.ok || !body.id || !body.name || !body.starts_on) {
        setMessage(body.error ?? "イベントの追加に失敗しました。");
        return;
      }

      const created = {
        id: body.id,
        name: body.name,
        startsOn: body.starts_on,
      };
      onCreated(created);
      setName("");
      setStartsOn("");
      setIsCreating(false);
      setMessage(`「${created.name}」を追加して選択しました。`);
    } catch {
      setMessage("通信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setPending(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void create();
    }
    if (event.key === "Escape") close();
  }

  return (
    <div className="taxonomy-quick-add">
      {isCreating ? (
        <div className="taxonomy-quick-form event-quick-form">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="追加するイベント名"
            aria-label="追加するイベント名"
            maxLength={200}
            autoFocus
            disabled={pending}
          />
          <input
            value={startsOn}
            onChange={(event) => setStartsOn(event.target.value)}
            onKeyDown={handleKeyDown}
            type="date"
            aria-label="追加するイベントの開催日"
            disabled={pending}
          />
          <div className="event-quick-actions">
            <button type="button" onClick={() => void create()} disabled={pending}>
              {pending ? <LoaderCircle className="spin" size={14} /> : <CalendarPlus size={14} />}
              追加
            </button>
            <button
              type="button"
              className="taxonomy-quick-cancel"
              onClick={close}
              disabled={pending}
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="taxonomy-quick-trigger"
          onClick={() => {
            setIsCreating(true);
            setMessage("");
          }}
        >
          <CalendarPlus size={14} />
          イベントを追加
        </button>
      )}
      {message ? (
        <p
          className={`taxonomy-quick-message${isCreating ? " event-quick-error" : ""}`}
          role={isCreating ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
