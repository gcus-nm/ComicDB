"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  LoaderCircle,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import type { BookDetail } from "@/lib/types";
import type { TaxonomyTag } from "@/lib/catalog";
import { TaxonomyFields } from "@/components/taxonomy-picker";

export function BookEditForm({
  book,
  taxonomies,
}: {
  book: BookDetail;
  taxonomies: TaxonomyTag[];
}) {
  const router = useRouter();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [savedCoverOverride, setSavedCoverOverride] = useState<{
    source: string | null;
    value: string | null;
  } | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [selectedCover, setSelectedCover] = useState<{
    url: string;
    fileName: string;
  } | null>(null);
  const tags = (type: string) =>
    book.tags.filter((tag) => tag.type === type).map((tag) => tag.name).join("、");
  const currentCoverUrl =
    savedCoverOverride?.source === book.coverUrl
      ? savedCoverOverride.value
      : book.coverUrl;

  useEffect(() => {
    return () => {
      if (selectedCover) URL.revokeObjectURL(selectedCover.url);
    };
  }, [selectedCover]);

  function selectCover(file?: File) {
    setSelectedCover(
      file
        ? {
            url: URL.createObjectURL(file),
            fileName: file.name,
          }
        : null,
    );
    if (file) setRemoveCover(false);
  }

  function clearCoverSelection() {
    setSelectedCover(null);
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  function requestCoverRemoval() {
    clearCoverSelection();
    setRemoveCover(true);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    data.set("priceYen", "");
    data.set("quantity", "1");
    data.set("removeCover", removeCover ? "true" : "false");
    const response = await fetch(`/api/books/${book.id}`, {
      method: "PATCH",
      headers: { "X-ComicDB-Request": "1" },
      body: data,
    });
    const body = (await response.json()) as {
      error?: string;
      coverUrl?: string | null;
    };
    setMessage(response.ok ? "変更を保存しました。" : (body.error ?? "保存に失敗しました。"));
    setPending(false);
    if (response.ok) {
      setSavedCoverOverride({
        source: book.coverUrl,
        value: body.coverUrl ?? null,
      });
      setRemoveCover(false);
      clearCoverSelection();
      router.refresh();
    }
  }

  const previewUrl =
    selectedCover?.url ?? (removeCover ? null : currentCoverUrl);

  return (
    <details className="edit-panel">
      <summary>蔵書情報を編集</summary>
      <form className="form-grid details-grid" onSubmit={submit}>
        <div className="edit-cover-field span-2">
          <span className="edit-cover-label">表紙画像</span>
          <label className={`cover-upload${previewUrl ? " has-preview" : ""}`}>
            {previewUrl ? (
              <>
                {/* Blob URLと認証付き画像はNext.js Imageの最適化対象外。 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="cover-upload-preview"
                  src={previewUrl}
                  alt={
                    selectedCover
                      ? "選択した新しい表紙のプレビュー"
                      : `${book.title}の現在の表紙`
                  }
                />
                <span className="cover-upload-copy" aria-live="polite">
                  <span className="cover-upload-status">
                    <Camera size={16} />
                    {selectedCover ? "新しい表紙を選択済み" : "登録済みの表紙"}
                  </span>
                  {selectedCover ? (
                    <strong title={selectedCover.fileName}>
                      {selectedCover.fileName}
                    </strong>
                  ) : null}
                  <span>クリックして別の画像を選択</span>
                  <span>JPEG・PNG・WebP・AVIF / 最大20MB</span>
                </span>
              </>
            ) : (
              <>
                <Camera size={27} />
                <strong>
                  {removeCover ? "新しい表紙を選択" : "表紙を選択"}
                </strong>
                <span>JPEG・PNG・WebP・AVIF / 最大20MB</span>
              </>
            )}
            <input
              ref={coverInputRef}
              name="cover"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              capture="environment"
              onChange={(eventObject) =>
                selectCover(eventObject.currentTarget.files?.[0])
              }
            />
          </label>
          <div className="cover-actions">
            {selectedCover ? (
              <button
                className="ghost-button"
                type="button"
                onClick={clearCoverSelection}
                disabled={pending}
              >
                <X size={16} />
                画像の選択を取り消す
              </button>
            ) : currentCoverUrl && !removeCover ? (
              <button
                className="ghost-button danger"
                type="button"
                onClick={requestCoverRemoval}
                disabled={pending}
              >
                <Trash2 size={16} />
                登録済みの表紙を削除
              </button>
            ) : removeCover ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => setRemoveCover(false)}
                disabled={pending}
              >
                <RotateCcw size={16} />
                表紙の削除を取り消す
              </button>
            ) : null}
          </div>
          {removeCover ? (
            <p className="edit-cover-notice" role="status">
              「変更を保存」を押すと、登録済みの表紙画像を削除します。
            </p>
          ) : null}
        </div>
        <label className="span-2">タイトル<input name="title" defaultValue={book.title} required /></label>
        <label>サークル<input name="circles" defaultValue={book.circles.join("、")} /></label>
        <label>作者<input name="creators" defaultValue={book.creators.join("、")} /></label>
        <TaxonomyFields
          taxonomies={taxonomies}
          selectedFandomIds={book.tags.filter((tag) => tag.type === "fandom").map((tag) => tag.id)}
          selectedCharacterIds={book.tags.filter((tag) => tag.type === "character").map((tag) => tag.id)}
          selectedPairingIds={book.tags.filter((tag) => tag.type === "pairing").map((tag) => tag.id)}
        />
        <label>ジャンル<input name="genres" defaultValue={tags("genre")} /></label>
        <label>タグ<input name="tags" defaultValue={tags("custom")} /></label>
        <label>成人区分
          <select name="adultRating" defaultValue={book.adultRating}>
            <option value="general">全年齢</option><option value="r18">R18</option>
          </select>
        </label>
        <label>発行日<input name="publishedOn" type="date" defaultValue={book.publishedOn ?? ""} /></label>
        <label>版<input name="edition" defaultValue={book.edition} /></label>
        <label>保管場所<input name="storageLocation" defaultValue={book.storageLocation ?? ""} /></label>
        <label>読了状態
          <select name="readStatus" defaultValue={book.readStatus}>
            <option value="unread">未読</option><option value="reading">読書中</option><option value="read">読了</option>
          </select>
        </label>
        <label className="checkbox-field">
          <input name="favorite" type="checkbox" value="true" defaultChecked={book.favorite} />お気に入り
        </label>
        <label className="span-2">
          関連リンク
          <textarea name="links" rows={3} defaultValue={book.links.join("\n")} />
          <span className="field-hint">URL、または [表示名](URL) を1行に1件入力します。</span>
        </label>
        <label className="span-2">メモ<textarea name="notes" rows={3} defaultValue={book.notes} /></label>
        <input type="hidden" name="eventId" value="" />
        <input type="hidden" name="ownershipStatus" value={book.ownershipStatus} />
        <input type="hidden" name="purchasedOn" value="" />
        <input type="hidden" name="acquisitionNotes" value="" />
        {message ? <p className="span-2 inline-message">{message}</p> : null}
        <button className="primary-button span-2" type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />}変更を保存
        </button>
      </form>
    </details>
  );
}
