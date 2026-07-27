"use client";

import { useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Circle,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  eventDurationDays,
  formatWishlistDate,
} from "@/lib/event-dates";
import type { WishlistItem } from "@/lib/types";

type WishlistDraft = {
  eventDay: number;
  title: string;
  circle: string;
  booth: string;
  quantity: number;
  priceYen: string;
  notes: string;
};

function sortItems(items: WishlistItem[]) {
  return [...items].sort(
    (left, right) =>
      Number(left.purchased) - Number(right.purchased) ||
      left.eventDay - right.eventDay ||
      left.createdAt.localeCompare(right.createdAt),
  );
}

function draftFromItem(item: WishlistItem): WishlistDraft {
  return {
    eventDay: item.eventDay,
    title: item.title,
    circle: item.circle,
    booth: item.booth,
    quantity: item.quantity,
    priceYen: item.priceYen?.toString() ?? "",
    notes: item.notes,
  };
}

export function WishlistManager({
  eventId,
  startsOn,
  endsOn,
  initialItems,
}: {
  eventId: string;
  startsOn: string;
  endsOn: string | null;
  initialItems: WishlistItem[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [items, setItems] = useState(() => sortItems(initialItems));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WishlistDraft | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const eventDays = Array.from(
    { length: eventDurationDays(startsOn, endsOn) ?? 1 },
    (_, index) => index + 1,
  );

  const purchasedCount = items.filter((item) => item.purchased).length;
  const remainingCount = items.length - purchasedCount;
  const remainingBudget = items.reduce(
    (total, item) =>
      !item.purchased && item.priceYen !== null
        ? total + item.priceYen * item.quantity
        : total,
    0,
  );

  async function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const priceYen = String(data.get("priceYen") ?? "").trim();
    setPending("add");
    setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/wishlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ComicDB-Request": "1",
        },
        body: JSON.stringify({
          eventDay: Number(data.get("eventDay") ?? 1),
          title: data.get("title"),
          circle: data.get("circle"),
          booth: data.get("booth"),
          quantity: Number(data.get("quantity") ?? 1),
          priceYen: priceYen ? Number(priceYen) : null,
          notes: data.get("notes"),
        }),
      });
      const body = (await response.json()) as WishlistItem & { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "ほしいものを追加できませんでした。");
        return;
      }
      setItems((current) => sortItems([...current, body]));
      formRef.current?.reset();
      setMessage("ほしいものを追加しました。");
    } catch {
      setMessage("通信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setPending(null);
    }
  }

  async function patchItem(id: string, input: Record<string, unknown>, action: string) {
    setPending(`${action}:${id}`);
    setMessage("");
    try {
      const response = await fetch(`/api/wishlist/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-ComicDB-Request": "1",
        },
        body: JSON.stringify(input),
      });
      const body = (await response.json()) as WishlistItem & { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "ほしいものを更新できませんでした。");
        return false;
      }
      setItems((current) =>
        sortItems(current.map((item) => (item.id === body.id ? body : item))),
      );
      return true;
    } catch {
      setMessage("通信に失敗しました。時間をおいて再度お試しください。");
      return false;
    } finally {
      setPending(null);
    }
  }

  async function togglePurchased(item: WishlistItem) {
    const updated = await patchItem(
      item.id,
      { purchased: !item.purchased },
      "toggle",
    );
    if (updated) {
      setMessage(
        item.purchased
          ? "未購入へ戻しました。"
          : "購入済みとしてチェックしました。",
      );
    }
  }

  function startEditing(item: WishlistItem) {
    setEditingId(item.id);
    setDraft(draftFromItem(item));
    setMessage("");
  }

  function stopEditing() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(item: WishlistItem) {
    if (!draft) return;
    const updated = await patchItem(
      item.id,
      {
        eventDay: draft.eventDay,
        title: draft.title,
        circle: draft.circle,
        booth: draft.booth,
        quantity: draft.quantity,
        priceYen: draft.priceYen ? Number(draft.priceYen) : null,
        notes: draft.notes,
      },
      "save",
    );
    if (updated) {
      stopEditing();
      setMessage("内容を更新しました。");
    }
  }

  async function removeItem(item: WishlistItem) {
    if (!window.confirm(`「${item.title}」をリストから削除しますか？`)) return;
    setPending(`delete:${item.id}`);
    setMessage("");
    try {
      const response = await fetch(`/api/wishlist/${item.id}`, {
        method: "DELETE",
        headers: { "X-ComicDB-Request": "1" },
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "ほしいものを削除できませんでした。");
        return;
      }
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      if (editingId === item.id) stopEditing();
      setMessage("リストから削除しました。");
    } catch {
      setMessage("通信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <section className="wishlist-summary" aria-label="ほしいものリスト集計">
        <div>
          <small>未購入</small>
          <strong>{remainingCount}</strong>
          <span>items</span>
        </div>
        <div>
          <small>購入済み</small>
          <strong>{purchasedCount}</strong>
          <span>checked</span>
        </div>
        <div>
          <small>未購入の予算目安</small>
          <strong>¥{remainingBudget.toLocaleString()}</strong>
          <span>estimate</span>
        </div>
      </section>

      <form
        ref={formRef}
        className="form-section wishlist-add-form"
        onSubmit={addItem}
      >
        <div className="form-section-heading">
          <span>01</span>
          <div>
            <h2>ほしいものを追加</h2>
            <p>タイトルだけでも登録できます。配置や予算は分かる範囲で入力してください。</p>
          </div>
        </div>
        <div className="form-grid">
          <label className="span-2">
            タイトル <b>必須</b>
            <input
              name="title"
              required
              maxLength={300}
              placeholder="例：新刊タイトル"
            />
          </label>
          <label>
            対象日 <b>必須</b>
            <select name="eventDay" defaultValue={1} required>
              {eventDays.map((eventDay) => (
                <option key={eventDay} value={eventDay}>
                  {formatWishlistDate(startsOn, eventDay)}
                </option>
              ))}
            </select>
          </label>
          <label>
            サークル
            <input name="circle" maxLength={200} placeholder="例：星空書房" />
          </label>
          <label>
            配置・スペース
            <input name="booth" maxLength={100} placeholder="例：東A-01a" />
          </label>
          <label>
            数量
            <input name="quantity" type="number" min={1} max={99} defaultValue={1} />
          </label>
          <label>
            予算・単価
            <input
              name="priceYen"
              type="number"
              min={0}
              max={10_000_000}
              inputMode="numeric"
              placeholder="円"
            />
          </label>
          <label className="span-2">
            メモ
            <textarea
              name="notes"
              rows={2}
              maxLength={1000}
              placeholder="新刊セット、購入制限など"
            />
          </label>
        </div>
        <button
          className="primary-button large"
          type="submit"
          disabled={pending !== null}
        >
          {pending === "add" ? (
            <LoaderCircle className="spin" size={19} />
          ) : (
            <Plus size={19} />
          )}
          リストへ追加
        </button>
      </form>

      {message ? (
        <p
          className={message.includes("できません") || message.includes("失敗")
            ? "form-error"
            : "form-success"}
          role="status"
        >
          {message}
        </p>
      ) : null}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">WISHLIST ITEMS</span>
            <h2>このイベントでほしいもの</h2>
          </div>
          <span className="wishlist-progress">
            <Check size={14} />
            {purchasedCount} / {items.length}
          </span>
        </div>

        {items.length ? (
          <div className="wishlist-items">
            {items.map((item) => {
              const isEditing = editingId === item.id && draft;
              return (
                <article
                  key={item.id}
                  className={`wishlist-item${item.purchased ? " purchased" : ""}`}
                >
                  <button
                    type="button"
                    className="wishlist-check"
                    aria-label={
                      item.purchased
                        ? `${item.title}を未購入へ戻す`
                        : `${item.title}を購入済みにする`
                    }
                    aria-pressed={item.purchased}
                    onClick={() => void togglePurchased(item)}
                    disabled={pending !== null}
                  >
                    {pending === `toggle:${item.id}` ? (
                      <LoaderCircle className="spin" size={23} />
                    ) : item.purchased ? (
                      <CheckCircle2 size={24} />
                    ) : (
                      <Circle size={24} />
                    )}
                  </button>

                  {isEditing ? (
                    <div className="wishlist-edit-form">
                      <div className="form-grid">
                        <label className="span-2">
                          タイトル
                          <input
                            value={draft.title}
                            onChange={(event) =>
                              setDraft({ ...draft, title: event.target.value })
                            }
                            required
                            maxLength={300}
                          />
                        </label>
                        <label>
                          対象日
                          <select
                            value={draft.eventDay}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                eventDay: Number(event.target.value),
                              })
                            }
                          >
                            {eventDays.map((eventDay) => (
                              <option key={eventDay} value={eventDay}>
                                {formatWishlistDate(startsOn, eventDay)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          サークル
                          <input
                            value={draft.circle}
                            onChange={(event) =>
                              setDraft({ ...draft, circle: event.target.value })
                            }
                            maxLength={200}
                          />
                        </label>
                        <label>
                          配置・スペース
                          <input
                            value={draft.booth}
                            onChange={(event) =>
                              setDraft({ ...draft, booth: event.target.value })
                            }
                            maxLength={100}
                          />
                        </label>
                        <label>
                          数量
                          <input
                            value={draft.quantity}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                quantity: Number(event.target.value),
                              })
                            }
                            type="number"
                            min={1}
                            max={99}
                          />
                        </label>
                        <label>
                          予算・単価
                          <input
                            value={draft.priceYen}
                            onChange={(event) =>
                              setDraft({ ...draft, priceYen: event.target.value })
                            }
                            type="number"
                            min={0}
                            max={10_000_000}
                          />
                        </label>
                        <label className="span-2">
                          メモ
                          <textarea
                            value={draft.notes}
                            onChange={(event) =>
                              setDraft({ ...draft, notes: event.target.value })
                            }
                            rows={2}
                            maxLength={1000}
                          />
                        </label>
                      </div>
                      <div className="wishlist-item-actions">
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => void saveEdit(item)}
                          disabled={
                            pending !== null ||
                            !draft.title.trim() ||
                            draft.quantity < 1
                          }
                        >
                          {pending === `save:${item.id}` ? (
                            <LoaderCircle className="spin" size={16} />
                          ) : (
                            <Save size={16} />
                          )}
                          保存
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={stopEditing}
                          disabled={pending !== null}
                        >
                          <X size={16} />
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="wishlist-item-body">
                      <div className="wishlist-item-title">
                        <h3>{item.title}</h3>
                        {item.purchased ? <span>購入済み</span> : null}
                      </div>
                      <div className="wishlist-item-meta">
                        <span className="wishlist-item-date">
                          {formatWishlistDate(startsOn, item.eventDay)}
                        </span>
                        {item.circle ? <span>{item.circle}</span> : null}
                        {item.booth ? <span>配置 {item.booth}</span> : null}
                        <span>{item.quantity}点</span>
                        {item.priceYen !== null ? (
                          <span>¥{item.priceYen.toLocaleString()}</span>
                        ) : null}
                      </div>
                      {item.notes ? <p>{item.notes}</p> : null}
                    </div>
                  )}

                  {!isEditing ? (
                    <div className="wishlist-item-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`${item.title}を編集`}
                        onClick={() => startEditing(item)}
                        disabled={pending !== null}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger-icon"
                        aria-label={`${item.title}を削除`}
                        onClick={() => void removeItem(item)}
                        disabled={pending !== null}
                      >
                        {pending === `delete:${item.id}` ? (
                          <LoaderCircle className="spin" size={16} />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state wishlist-empty">
            <Plus size={28} />
            <h3>ほしいものを追加しましょう</h3>
            <p>対象日、タイトル、サークル、配置、予算をイベントごとにまとめられます。</p>
          </div>
        )}
      </section>
    </>
  );
}
