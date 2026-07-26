"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookCheck,
  Camera,
  ChevronDown,
  LoaderCircle,
  Plus,
  Save,
} from "lucide-react";
import type { BookSummary } from "@/lib/types";
import type { TaxonomyTag } from "@/lib/catalog";
import { TaxonomyFields } from "@/components/taxonomy-picker";
import {
  EventQuickCreate,
  type SelectableEvent,
} from "@/components/event-quick-create";

type Duplicate = BookSummary & { score: number; circleMatch: boolean };

export function BookForm({
  event,
  events = [],
  taxonomies = [],
  continuous = false,
}: {
  event?: { id: string; name: string; startsOn: string };
  events?: Array<{ id: string; name: string; startsOn: string }>;
  taxonomies?: TaxonomyTag[];
  continuous?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [availableEvents, setAvailableEvents] = useState(events);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [coverPreview, setCoverPreview] = useState<{
    url: string;
    fileName: string;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview.url);
    };
  }, [coverPreview]);

  function selectCover(file?: File) {
    setCoverPreview(
      file
        ? {
            url: URL.createObjectURL(file),
            fileName: file.name,
          }
        : null,
    );
  }

  function addCreatedEvent(created: SelectableEvent) {
    setAvailableEvents((current) => [
      created,
      ...current.filter((item) => item.id !== created.id),
    ]);
    setSelectedEventId(created.id);
  }

  async function checkDuplicates() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    if (!title) {
      setDuplicates([]);
      return;
    }
    setChecking(true);
    const params = new URLSearchParams({
      title,
      circle: String(data.get("circles") ?? ""),
    });
    const response = await fetch(`/api/books/duplicates?${params}`);
    if (response.ok) {
      const body = (await response.json()) as { candidates: Duplicate[] };
      setDuplicates(body.candidates);
    }
    setChecking(false);
  }

  async function submit(eventObject: React.FormEvent<HTMLFormElement>) {
    eventObject.preventDefault();
    setPending(true);
    setError("");
    setNotice("");
    const data = new FormData(eventObject.currentTarget);
    if (event) {
      data.set("eventId", event.id);
      if (!data.get("purchasedOn")) data.set("purchasedOn", event.startsOn);
    }
    const response = await fetch("/api/books", {
      method: "POST",
      headers: { "X-ComicDB-Request": "1" },
      body: data,
    });
    const body = (await response.json()) as { id?: string; title?: string; error?: string };
    if (!response.ok) {
      setError(body.error ?? "登録に失敗しました。");
      setPending(false);
      return;
    }
    if (continuous) {
      eventObject.currentTarget.reset();
      setCoverPreview(null);
      if (!event) setSelectedEventId("");
      setDuplicates([]);
      setSavedCount((count) => count + 1);
      setNotice(`「${body.title}」を登録しました。次の本を入力できます。`);
      const titleInput = eventObject.currentTarget.elements.namedItem("title") as HTMLInputElement;
      titleInput?.focus();
      router.refresh();
    } else {
      router.push(`/books/${body.id}`);
      router.refresh();
    }
    setPending(false);
  }

  async function addCopy(book: Duplicate) {
    const form = formRef.current;
    if (!form) return;
    setPending(true);
    setError("");
    const data = new FormData(form);
    const response = await fetch(`/api/books/${book.id}/acquisitions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ComicDB-Request": "1",
      },
      body: JSON.stringify({
        eventId: event?.id ?? (data.get("eventId") || null),
        purchasedOn: data.get("purchasedOn") || event?.startsOn || "",
        priceYen: data.get("priceYen") || null,
        quantity: data.get("quantity") || 1,
        notes: data.get("acquisitionNotes") || "",
      }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(body.error ?? "購入履歴の追加に失敗しました。");
    } else {
      form.reset();
      setCoverPreview(null);
      if (!event) setSelectedEventId("");
      setDuplicates([]);
      setSavedCount((count) => count + 1);
      setNotice(
        book.ownershipStatus === "disposed"
          ? `「${book.title}」の再入手を記録し、所持中へ戻しました。`
          : `「${book.title}」の追加購入を記録しました。`,
      );
      router.refresh();
    }
    setPending(false);
  }

  return (
    <form ref={formRef} className="book-form" onSubmit={submit}>
      {continuous ? (
        <div className="continuous-status">
          <BookCheck size={18} />
          このセッションで <strong>{savedCount}</strong> 冊登録
        </div>
      ) : null}
      <div className="form-section">
        <div className="form-section-heading">
          <span>01</span>
          <div>
            <h2>基本情報</h2>
            <p>重複確認に使うタイトルとサークルを最初に入力します。</p>
          </div>
        </div>
        <div className="form-grid">
          <label className="span-2">
            タイトル <b>必須</b>
            <input
              name="title"
              required
              maxLength={300}
              onBlur={checkDuplicates}
              autoFocus
              placeholder="例：夏の記憶"
            />
          </label>
          <label>
            サークル
            <input name="circles" onBlur={checkDuplicates} placeholder="複数は「、」区切り" />
          </label>
          <label>
            作者
            <input name="creators" placeholder="複数は「、」区切り" />
          </label>
        </div>
        {checking ? <p className="inline-status"><LoaderCircle className="spin" size={16} />重複を確認中…</p> : null}
        {duplicates.length ? (
          <div className="duplicate-box">
            <div className="duplicate-title">
              <AlertTriangle size={19} />
              <div>
                <strong>似ている蔵書があります</strong>
                <p>同じ本なら購入履歴だけ追加できます。</p>
              </div>
            </div>
            <div className="duplicate-list">
              {duplicates.map((book) => (
                <article key={book.id}>
                  <div>
                    <strong>{book.title}</strong>
                    <span>
                      {book.circles.join(" / ") || "サークル未登録"} ·{" "}
                      {book.ownershipStatus === "disposed"
                        ? `処分済み（購入記録${book.ownedCount}冊）`
                        : `${book.ownedCount}冊所持`}
                    </span>
                  </div>
                  <button type="button" onClick={() => addCopy(book)} disabled={pending}>
                    <Plus size={16} />{" "}
                    {book.ownershipStatus === "disposed" ? "再入手として追加" : "この本を追加購入"}
                  </button>
                </article>
              ))}
            </div>
            <p className="duplicate-hint">別作品・別版の場合は、そのまま下の「新しい蔵書として保存」を押してください。</p>
          </div>
        ) : null}
      </div>

      <div className="form-section">
        <div className="form-section-heading">
          <span>02</span>
          <div>
            <h2>表紙と分類</h2>
            <p>表紙があると会場でも素早く見分けられます。</p>
          </div>
        </div>
        <label className={`cover-upload${coverPreview ? " has-preview" : ""}`}>
          {coverPreview ? (
            <>
              {/* Blob URLはNext.js Imageの最適化対象外なので、選択直後のローカル表示にはimgを使う。 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="cover-upload-preview"
                src={coverPreview.url}
                alt="選択した表紙のプレビュー"
              />
              <span className="cover-upload-copy" aria-live="polite">
                <span className="cover-upload-status">
                  <Camera size={16} />
                  表紙を選択済み
                </span>
                <strong title={coverPreview.fileName}>{coverPreview.fileName}</strong>
                <span>クリックして別の画像を選択</span>
                <span>JPEG・PNG・WebP・AVIF / 最大20MB</span>
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
            name="cover"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            capture="environment"
            onChange={(eventObject) => selectCover(eventObject.currentTarget.files?.[0])}
          />
        </label>
        <div className="form-grid">
          <label>
            成人区分
            <select name="adultRating" defaultValue="general">
              <option value="general">全年齢</option>
              <option value="r18">R18</option>
            </select>
          </label>
          <TaxonomyFields taxonomies={taxonomies} allowTaxonomyCreate />
          <label>
            ジャンル
            <input name="genres" placeholder="漫画、小説、イラスト" />
          </label>
          <label>
            タグ
            <input name="tags" placeholder="自由な分類" />
          </label>
        </div>
      </div>

      <details className="form-section form-details">
        <summary><ChevronDown size={18} /> 詳細情報と購入情報</summary>
        <div className="form-grid details-grid">
          {event ? (
            <label>
              購入イベント
              <input value={event.name} readOnly aria-label="購入イベント" />
              <span className="field-hint">このイベントの購入品として登録します。</span>
            </label>
          ) : (
            <div className="book-event-field">
              <label htmlFor="book-event-select">購入イベント</label>
              <select
                id="book-event-select"
                name="eventId"
                value={selectedEventId}
                onChange={(eventObject) => setSelectedEventId(eventObject.target.value)}
              >
                <option value="">イベント未指定</option>
                {availableEvents.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.startsOn}　{item.name}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                {availableEvents.length ? (
                  "登録済みイベントから選択できます。"
                ) : (
                  "イベントがまだありません。下から追加できます。"
                )}
              </span>
              <EventQuickCreate onCreated={addCreatedEvent} />
            </div>
          )}
          <label>
            発行日
            <input name="publishedOn" type="date" />
          </label>
          <label>
            版・再版
            <input name="edition" placeholder="例：第2版" />
          </label>
          <label>
            保管場所
            <input name="storageLocation" placeholder="例：本棚A・上段" />
          </label>
          <label>
            読了状態
            <select name="readStatus" defaultValue="unread">
              <option value="unread">未読</option>
              <option value="reading">読書中</option>
              <option value="read">読了</option>
            </select>
          </label>
          <label>
            購入日
            <input name="purchasedOn" type="date" defaultValue={event?.startsOn} />
          </label>
          <label>
            購入価格
            <div className="input-with-suffix">
              <input name="priceYen" type="number" min="0" inputMode="numeric" />
              <span>円</span>
            </div>
          </label>
          <label>
            数量
            <input name="quantity" type="number" min="1" max="99" defaultValue="1" inputMode="numeric" />
          </label>
          <label className="checkbox-field">
            <input name="favorite" type="checkbox" value="true" />
            お気に入りにする
          </label>
          <label className="span-2">
            メモ
            <textarea name="notes" rows={3} placeholder="感想、探すときの手がかりなど" />
          </label>
          <label className="span-2">
            購入メモ
            <input name="acquisitionNotes" placeholder="新刊セット、委託購入など" />
          </label>
        </div>
      </details>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {notice ? <p className="form-success" role="status">{notice}</p> : null}
      <div className="form-actions sticky">
        <button className="primary-button large" type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="spin" size={19} /> : <Save size={19} />}
          {duplicates.length ? "新しい蔵書として保存" : continuous ? "保存して次の本へ" : "蔵書を保存"}
        </button>
      </div>
    </form>
  );
}
