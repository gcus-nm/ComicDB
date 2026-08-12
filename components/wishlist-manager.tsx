"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Camera,
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
import { TaxonomyFields } from "@/components/taxonomy-picker";
import type { TaxonomyTag } from "@/lib/catalog";

function sortItems(items: WishlistItem[]) {
  return [...items].sort(
    (left, right) =>
      Number(left.purchased) - Number(right.purchased) ||
      left.eventDay - right.eventDay ||
      left.createdAt.localeCompare(right.createdAt),
  );
}

function CoverField({
  currentUrl = null,
  locked = false,
}: {
  currentUrl?: string | null;
  locked?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);

  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  function select(file?: File) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const nextUrl = file ? URL.createObjectURL(file) : null;
    setObjectUrl(nextUrl);
    setPreview(nextUrl ?? (removed ? null : currentUrl));
    setRemoved(false);
  }

  function remove() {
    if (inputRef.current) inputRef.current.value = "";
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(null);
    setPreview(null);
    setRemoved(true);
  }

  return (
    <div className="wishlist-cover-field span-2">
      <label className={`cover-upload${preview ? " has-preview" : ""}`}>
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="cover-upload-preview" src={preview} alt="表紙のプレビュー" />
            <span className="cover-upload-copy">
              <span className="cover-upload-status"><Camera size={16} />表紙を登録済み</span>
              <span>{locked ? "変更は蔵書編集画面から行えます" : "クリックして別の画像を選択"}</span>
            </span>
          </>
        ) : (
          <>
            <Camera size={27} />
            <strong>表紙を撮影・選択</strong>
            <span>JPEG・PNG・WebP・AVIF / 最大20MB</span>
          </>
        )}
        <input
          ref={inputRef}
          name="cover"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          capture="environment"
          disabled={locked}
          onChange={(event) => select(event.currentTarget.files?.[0])}
        />
      </label>
      {currentUrl ? <input type="hidden" name="removeCover" value={removed ? "true" : "false"} /> : null}
      {preview && !locked ? (
        <button className="ghost-button danger" type="button" onClick={remove}>
          <Trash2 size={16} />表紙を削除
        </button>
      ) : null}
    </div>
  );
}

function BookFields({
  taxonomies,
  item,
}: {
  taxonomies: TaxonomyTag[];
  item?: WishlistItem;
}) {
  return (
    <>
      <CoverField currentUrl={item?.coverUrl} locked={Boolean(item?.bookId)} />
      <label>
        作者
        <input name="creators" defaultValue={item?.creators} placeholder="複数は「、」区切り" />
      </label>
      <label>
        成人区分
        <select name="adultRating" defaultValue={item?.adultRating ?? "general"}>
          <option value="general">全年齢</option>
          <option value="r18">R18</option>
        </select>
      </label>
      <TaxonomyFields
        taxonomies={taxonomies}
        selectedFandomIds={item?.fandomTagIds}
        selectedCharacterIds={item?.characterTagIds}
        selectedPairingIds={item?.pairingTagIds}
        allowTaxonomyCreate
      />
      <label>
        ジャンル
        <input name="genres" defaultValue={item?.genres} placeholder="漫画、小説、イラスト" />
      </label>
      <label>
        タグ
        <input name="tags" defaultValue={item?.tags} placeholder="自由な分類" />
      </label>
      <label>
        発行日
        <input name="publishedOn" type="date" defaultValue={item?.publishedOn ?? ""} />
      </label>
      <label>
        版・再版
        <input name="edition" defaultValue={item?.edition} maxLength={120} placeholder="例：第2版" />
      </label>
    </>
  );
}

export function WishlistManager({
  eventId,
  startsOn,
  endsOn,
  initialItems,
  taxonomies,
}: {
  eventId: string;
  startsOn: string;
  endsOn: string | null;
  initialItems: WishlistItem[];
  taxonomies: TaxonomyTag[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [items, setItems] = useState(() => sortItems(initialItems));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addFormKey, setAddFormKey] = useState(0);
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
    setPending("add");
    setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/wishlist`, {
        method: "POST",
        headers: { "X-ComicDB-Request": "1" },
        body: data,
      });
      const body = (await response.json()) as WishlistItem & { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "ほしいものを追加できませんでした。");
        return;
      }
      setItems((current) => sortItems([...current, body]));
      router.refresh();
      formRef.current?.reset();
      setAddFormKey((value) => value + 1);
      setMessage("ほしいものを追加しました。");
    } catch {
      setMessage("通信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setPending(null);
    }
  }

  async function patchItem(
    id: string,
    input: Record<string, unknown> | FormData,
    action: string,
  ) {
    setPending(`${action}:${id}`);
    setMessage("");
    try {
      const response = await fetch(`/api/wishlist/${id}`, {
        method: "PATCH",
        headers: input instanceof FormData
          ? { "X-ComicDB-Request": "1" }
          : {
              "Content-Type": "application/json",
              "X-ComicDB-Request": "1",
            },
        body: input instanceof FormData ? input : JSON.stringify(input),
      });
      const body = (await response.json()) as WishlistItem & { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "ほしいものを更新できませんでした。");
        return false;
      }
      setItems((current) =>
        sortItems(current.map((item) => (item.id === body.id ? body : item))),
      );
      router.refresh();
      return body;
    } catch {
      setMessage("通信に失敗しました。時間をおいて再度お試しください。");
      return null;
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
          ? item.bookId
            ? "未購入へ戻しました。登録済みの蔵書は残ります。"
            : "未購入へ戻しました。"
          : item.bookId
            ? "購入済みに戻しました。登録済みの蔵書はそのままです。"
            : "購入済みにし、蔵書へ登録しました。",
      );
    }
  }

  function startEditing(item: WishlistItem) {
    setEditingId(item.id);
    setMessage("");
  }

  function stopEditing() {
    setEditingId(null);
  }

  async function saveEdit(
    event: React.FormEvent<HTMLFormElement>,
    item: WishlistItem,
  ) {
    event.preventDefault();
    const updated = await patchItem(
      item.id,
      new FormData(event.currentTarget),
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
      router.refresh();
      if (editingId === item.id) stopEditing();
      setMessage(
        item.bookId
          ? "リストから削除しました。登録済みの蔵書は残ります。"
          : "リストから削除しました。",
      );
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
        key={addFormKey}
        ref={formRef}
        className="form-section wishlist-add-form"
        onSubmit={addItem}
      >
        <div className="form-section-heading">
          <span>01</span>
          <div>
            <h2>ほしいものを追加</h2>
            <p>購入後に蔵書へ引き継ぐ情報を、分かる範囲で先に入力できます。</p>
          </div>
        </div>
        <div className="form-grid">
          <label className="span-2">
            <span className="field-label">
              タイトル <b>必須</b>
            </span>
            <input
              name="title"
              required
              maxLength={300}
              placeholder="例：新刊タイトル"
            />
          </label>
          <label>
            <span className="field-label">
              対象日 <b>必須</b>
            </span>
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
            <input name="circle" maxLength={200} placeholder="複数は「、」区切り" />
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
              maxLength={5000}
              placeholder="蔵書のメモとして引き継がれます"
            />
          </label>
          <details className="wishlist-book-details span-2">
            <summary>表紙・作者・分類・発行情報を入力</summary>
            <div className="form-grid">
              <BookFields taxonomies={taxonomies} />
            </div>
          </details>
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
              const isEditing = editingId === item.id;
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
                    <form
                      className="wishlist-edit-form"
                      onSubmit={(event) => void saveEdit(event, item)}
                    >
                      <div className="form-grid">
                        <label className="span-2">
                          タイトル
                          <input
                            name="title"
                            defaultValue={item.title}
                            required
                            maxLength={300}
                          />
                        </label>
                        <label>
                          対象日
                          <select
                            name="eventDay"
                            defaultValue={item.eventDay}
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
                            name="circle"
                            defaultValue={item.circle}
                            maxLength={200}
                          />
                        </label>
                        <label>
                          配置・スペース
                          <input
                            name="booth"
                            defaultValue={item.booth}
                            maxLength={100}
                          />
                        </label>
                        <label>
                          数量
                          <input
                            name="quantity"
                            defaultValue={item.quantity}
                            type="number"
                            min={1}
                            max={99}
                          />
                        </label>
                        <label>
                          予算・単価
                          <input
                            name="priceYen"
                            defaultValue={item.priceYen ?? ""}
                            type="number"
                            min={0}
                            max={10_000_000}
                          />
                        </label>
                        <label className="span-2">
                          メモ
                          <textarea
                            name="notes"
                            defaultValue={item.notes}
                            rows={2}
                            maxLength={5000}
                          />
                        </label>
                        <details className="wishlist-book-details span-2">
                          <summary>表紙・作者・分類・発行情報を編集</summary>
                          <div className="form-grid">
                            <BookFields taxonomies={taxonomies} item={item} />
                          </div>
                        </details>
                      </div>
                      <div className="wishlist-item-actions">
                        <button
                          type="submit"
                          className="primary-button"
                          disabled={pending !== null}
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
                    </form>
                  ) : (
                    <div className="wishlist-item-body">
                      {item.thumbnailUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className="wishlist-item-cover"
                            src={item.thumbnailUrl}
                            alt={`${item.title}の表紙`}
                          />
                        </>
                      ) : null}
                      <div className="wishlist-item-title">
                        <h3>{item.title}</h3>
                        {item.purchased ? <span>購入済み</span> : null}
                      </div>
                      <div className="wishlist-item-meta">
                        <span className="wishlist-item-date">
                          {formatWishlistDate(startsOn, item.eventDay)}
                        </span>
                        {item.circle ? <span>{item.circle}</span> : null}
                        {item.creators ? <span>作者 {item.creators}</span> : null}
                        {item.adultRating === "r18" ? <span>R18</span> : null}
                        {item.publishedOn ? <span>発行 {item.publishedOn}</span> : null}
                        {item.edition ? <span>{item.edition}</span> : null}
                        {[...item.fandomTagIds, ...item.characterTagIds, ...item.pairingTagIds]
                          .map((id) => taxonomies.find((tag) => tag.id === id)?.name)
                          .filter((name): name is string => Boolean(name))
                          .map((name) => <span key={name}>{name}</span>)}
                        {item.genres ? <span>{item.genres}</span> : null}
                        {item.tags ? <span>{item.tags}</span> : null}
                        {item.booth ? <span>配置 {item.booth}</span> : null}
                        <span>{item.quantity}点</span>
                        {item.priceYen !== null ? (
                          <span>¥{item.priceYen.toLocaleString()}</span>
                        ) : null}
                        {item.bookId ? (
                          <Link
                            className="wishlist-book-link"
                            href={`/books/${item.bookId}`}
                          >
                            <BookOpen size={13} />
                            蔵書を見る
                          </Link>
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
