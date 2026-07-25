"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Save } from "lucide-react";
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
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const tags = (type: string) =>
    book.tags.filter((tag) => tag.type === type).map((tag) => tag.name).join("、");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const object = Object.fromEntries(data);
    const response = await fetch(`/api/books/${book.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-ComicDB-Request": "1",
      },
      body: JSON.stringify({
        ...object,
        fandomTagIds: data.getAll("fandomTagIds"),
        characterTagIds: data.getAll("characterTagIds"),
        pairingTagIds: data.getAll("pairingTagIds"),
        favorite: data.get("favorite") === "true",
        priceYen: null,
        quantity: 1,
      }),
    });
    const body = (await response.json()) as { error?: string };
    setMessage(response.ok ? "変更を保存しました。" : (body.error ?? "保存に失敗しました。"));
    setPending(false);
    if (response.ok) router.refresh();
  }

  return (
    <details className="edit-panel">
      <summary>蔵書情報を編集</summary>
      <form className="form-grid details-grid" onSubmit={submit}>
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
        <label className="span-2">メモ<textarea name="notes" rows={3} defaultValue={book.notes} /></label>
        <input type="hidden" name="eventId" value="" />
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
