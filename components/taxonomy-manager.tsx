"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, Shapes, Trash2 } from "lucide-react";
import type { TaxonomyTag } from "@/lib/catalog";

const TYPES = [
  { value: "fandom", label: "作品" },
  { value: "character", label: "キャラクター" },
  { value: "pairing", label: "カップリング" },
] as const;

export function TaxonomyManager({ tags }: { tags: TaxonomyTag[] }) {
  const router = useRouter();
  const fandoms = tags.filter((tag) => tag.type === "fandom");
  const [type, setType] = useState<TaxonomyTag["type"]>("fandom");
  const [parentId, setParentId] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const response = await fetch("/api/taxonomies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ComicDB-Request": "1",
      },
      body: JSON.stringify({ type, name, parentId: type === "fandom" ? null : parentId }),
    });
    const body = (await response.json()) as { error?: string };
    if (response.ok) {
      setName("");
      setMessage("分類を追加しました。");
      router.refresh();
    } else {
      setMessage(body.error ?? "追加に失敗しました。");
    }
    setPending(false);
  }

  async function assign(tagId: string, nextParentId: string) {
    if (!nextParentId) return;
    setPending(true);
    setMessage("");
    const response = await fetch("/api/taxonomies", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-ComicDB-Request": "1",
      },
      body: JSON.stringify({ id: tagId, parentId: nextParentId }),
    });
    const body = (await response.json()) as { error?: string };
    setMessage(response.ok ? "作品へ紐づけました。" : (body.error ?? "更新に失敗しました。"));
    setPending(false);
    if (response.ok) router.refresh();
  }

  async function remove(tag: TaxonomyTag) {
    if (tag.usageCount > 0 || !window.confirm(`「${tag.name}」を削除しますか？`)) return;
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/taxonomies?id=${encodeURIComponent(tag.id)}`, {
      method: "DELETE",
      headers: { "X-ComicDB-Request": "1" },
    });
    const body = (await response.json()) as { error?: string };
    setMessage(response.ok ? "分類を削除しました。" : (body.error ?? "削除に失敗しました。"));
    setPending(false);
    if (response.ok) router.refresh();
  }

  const row = (tag: TaxonomyTag) => (
    <li key={tag.id}>
      <span>
        {tag.name}
        <small>{tag.usageCount}冊で使用</small>
      </span>
      <button
        type="button"
        onClick={() => remove(tag)}
        disabled={pending || tag.usageCount > 0}
        aria-label={`${tag.name}を削除`}
        title={tag.usageCount > 0 ? "使用中のため削除できません" : "削除"}
      >
        <Trash2 size={14} />
      </button>
    </li>
  );

  const unassigned = tags.filter(
    (tag) => tag.type !== "fandom" && !tag.parentId,
  );

  return (
    <section className="settings-card" id="taxonomy-manager">
      <div className="settings-card-icon"><Shapes size={22} /></div>
      <div className="settings-card-body">
        <h2>作品・キャラクター分類</h2>
        <p>作品を親として、キャラクターとカップリングを作品ごとに管理します。</p>
        <form className="taxonomy-add-form" onSubmit={add}>
          <select
            value={type}
            onChange={(event) => {
              const nextType = event.target.value as TaxonomyTag["type"];
              setType(nextType);
              if (nextType === "fandom") setParentId("");
            }}
            aria-label="分類種別"
          >
            {TYPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          {type !== "fandom" ? (
            <select
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              aria-label="所属する作品"
              required
            >
              <option value="">所属する作品を選択</option>
              {fandoms.map((fandom) => (
                <option key={fandom.id} value={fandom.id}>{fandom.name}</option>
              ))}
            </select>
          ) : null}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={type === "fandom" ? "作品名" : "名称を入力"}
            required
            maxLength={160}
          />
          <button className="primary-button small" type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}
            追加
          </button>
        </form>

        {unassigned.length ? (
          <div className="taxonomy-unassigned">
            <strong>作品未所属の既存データ</strong>
            <p>以前に登録した項目です。所属する作品を選んで整理できます。</p>
            {unassigned.map((tag) => (
              <label key={tag.id}>
                <span>{tag.type === "character" ? "キャラクター" : "カップリング"}：{tag.name}</span>
                <select
                  defaultValue=""
                  onChange={(event) => void assign(tag.id, event.target.value)}
                  disabled={pending}
                >
                  <option value="">作品を選択</option>
                  {fandoms.map((fandom) => (
                    <option key={fandom.id} value={fandom.id}>{fandom.name}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : null}

        <div className="taxonomy-master-grid taxonomy-tree">
          {fandoms.map((fandom) => {
            const characters = tags.filter(
              (tag) => tag.type === "character" && tag.parentId === fandom.id,
            );
            const pairings = tags.filter(
              (tag) => tag.type === "pairing" && tag.parentId === fandom.id,
            );
            return (
              <section key={fandom.id}>
                <h3>
                  <span className="taxonomy-fandom-name">{fandom.name}</span>
                  <button
                    type="button"
                    onClick={() => remove(fandom)}
                    disabled={pending || fandom.usageCount > 0 || characters.length > 0 || pairings.length > 0}
                    aria-label={`${fandom.name}を削除`}
                  >
                    <Trash2 size={14} />
                  </button>
                </h3>
                <h4>キャラクター <span>{characters.length}</span></h4>
                {characters.length ? <ul>{characters.map(row)}</ul> : <p>未登録</p>}
                <h4>カップリング <span>{pairings.length}</span></h4>
                {pairings.length ? <ul>{pairings.map(row)}</ul> : <p>未登録</p>}
              </section>
            );
          })}
          {!fandoms.length ? <p className="taxonomy-no-fandom">まず作品を登録してください。</p> : null}
        </div>
        {message ? <p className="status-line" role="status">{message}</p> : null}
      </div>
    </section>
  );
}
