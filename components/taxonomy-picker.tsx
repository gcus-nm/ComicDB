"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { LoaderCircle, Plus } from "lucide-react";
import type { TaxonomyTag } from "@/lib/catalog";

function Picker({
  label,
  name,
  options,
  selected,
  onToggle,
  emptyMessage,
  footer,
}: {
  label: string;
  name: "fandomTagIds" | "characterTagIds" | "pairingTagIds";
  options: TaxonomyTag[];
  selected: string[];
  onToggle: (id: string, checked: boolean) => void;
  emptyMessage: string;
  footer?: ReactNode;
}) {
  return (
    <fieldset className="taxonomy-picker">
      <legend>{label}</legend>
      {options.length ? (
        <div className="taxonomy-options">
          {options.map((option) => (
            <label key={option.id}>
              <input
                type="checkbox"
                name={name}
                value={option.id}
                checked={selected.includes(option.id)}
                onChange={(event) => onToggle(option.id, event.target.checked)}
              />
              <span>{option.name}</span>
            </label>
          ))}
        </div>
      ) : (
        <p>{emptyMessage}</p>
      )}
      {footer}
    </fieldset>
  );
}

function QuickCreate({
  label,
  type,
  parentOptions = [],
  onCreated,
}: {
  label: "作品" | "キャラクター" | "カップリング";
  type: TaxonomyTag["type"];
  parentOptions?: TaxonomyTag[];
  onCreated: (tag: TaxonomyTag) => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const needsParent = type !== "fandom";
  const canCreate = !needsParent || parentOptions.length > 0;
  const selectedParentId = parentOptions.some((option) => option.id === parentId)
    ? parentId
    : (parentOptions[0]?.id ?? "");

  function close() {
    setIsCreating(false);
    setMessage("");
  }

  async function create() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setMessage(`${label}名を入力してください。`);
      return;
    }
    if (needsParent && !selectedParentId) {
      setMessage("先に紐づける作品を選択してください。");
      return;
    }

    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/taxonomies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ComicDB-Request": "1",
        },
        body: JSON.stringify({
          name: trimmedName,
          type,
          parentId: needsParent ? selectedParentId : null,
        }),
      });
      const body = (await response.json()) as TaxonomyTag & { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? `${label}の追加に失敗しました。`);
        return;
      }

      onCreated(body);
      setName("");
      setIsCreating(false);
      setMessage(`「${body.name}」を追加して選択しました。`);
    } catch {
      setMessage("通信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="taxonomy-quick-add">
      {isCreating ? (
        <div className="taxonomy-quick-form">
          {needsParent && parentOptions.length > 1 ? (
            <select
              value={selectedParentId}
              onChange={(event) => setParentId(event.target.value)}
              aria-label={`${label}を紐づける作品`}
              disabled={pending}
            >
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          ) : null}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void create();
              }
              if (event.key === "Escape") close();
            }}
            placeholder={`追加する${label}名`}
            aria-label={`追加する${label}名`}
            autoFocus
            disabled={pending || !canCreate}
          />
          <button
            type="button"
            onClick={() => void create()}
            disabled={pending || !canCreate}
          >
            {pending ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}
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
      ) : (
        <button
          type="button"
          className="taxonomy-quick-trigger"
          onClick={() => {
            setIsCreating(true);
            setParentId(parentOptions[0]?.id ?? "");
            setMessage("");
          }}
          disabled={!canCreate}
          title={canCreate ? `${label}を追加` : "先に作品を選択してください"}
        >
          <Plus size={14} />
          {label}を追加
        </button>
      )}
      {!canCreate ? (
        <p className="taxonomy-quick-disabled">作品を選択すると追加できます。</p>
      ) : null}
      {message ? (
        <p className="taxonomy-quick-message" role="status">{message}</p>
      ) : null}
      <Link href="/manage#taxonomy-manager">分類マスターを管理</Link>
    </div>
  );
}

export function TaxonomyFields({
  taxonomies,
  selectedFandomIds = [],
  selectedCharacterIds = [],
  selectedPairingIds = [],
  allowTaxonomyCreate = false,
}: {
  taxonomies: TaxonomyTag[];
  selectedFandomIds?: string[];
  selectedCharacterIds?: string[];
  selectedPairingIds?: string[];
  allowTaxonomyCreate?: boolean;
}) {
  const [availableTaxonomies, setAvailableTaxonomies] = useState(taxonomies);
  const [selectedFandoms, setSelectedFandoms] = useState(selectedFandomIds);
  const [selectedCharacters, setSelectedCharacters] = useState(selectedCharacterIds);
  const [selectedPairings, setSelectedPairings] = useState(selectedPairingIds);
  const fandoms = availableTaxonomies.filter((tag) => tag.type === "fandom");
  const selectedFandomOptions = fandoms.filter((tag) => selectedFandoms.includes(tag.id));
  const childIsVisible = (tag: TaxonomyTag) =>
    !tag.parentId || selectedFandoms.includes(tag.parentId);
  const characters = availableTaxonomies.filter(
    (tag) => tag.type === "character" && childIsVisible(tag),
  );
  const pairings = availableTaxonomies.filter(
    (tag) => tag.type === "pairing" && childIsVisible(tag),
  );
  const toggle = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    id: string,
    checked: boolean,
  ) => setter((current) =>
    checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)
  );

  function toggleFandom(id: string, checked: boolean) {
    setSelectedFandoms((current) =>
      checked ? [...new Set([...current, id])] : current.filter((item) => item !== id),
    );
    if (!checked) {
      setSelectedCharacters((current) =>
        current.filter((tagId) => {
          const tag = availableTaxonomies.find((item) => item.id === tagId);
          return !tag?.parentId || tag.parentId !== id;
        }),
      );
      setSelectedPairings((current) =>
        current.filter((tagId) => {
          const tag = availableTaxonomies.find((item) => item.id === tagId);
          return !tag?.parentId || tag.parentId !== id;
        }),
      );
    }
  }

  function addCreatedTaxonomy(tag: TaxonomyTag) {
    setAvailableTaxonomies((current) => [...current, tag]);
    if (tag.type === "fandom") {
      setSelectedFandoms((current) => [...new Set([...current, tag.id])]);
    } else if (tag.type === "character") {
      setSelectedCharacters((current) => [...new Set([...current, tag.id])]);
    } else {
      setSelectedPairings((current) => [...new Set([...current, tag.id])]);
    }
  }

  if (!fandoms.length && !allowTaxonomyCreate) {
    return (
      <div className="taxonomy-empty span-2">
        作品がまだ登録されていません。
        <Link href="/manage#taxonomy-manager">管理画面で作品を追加</Link>
      </div>
    );
  }

  return (
    <>
      <Picker
        label="作品"
        name="fandomTagIds"
        options={fandoms}
        selected={selectedFandoms}
        onToggle={toggleFandom}
        emptyMessage="作品がありません。"
        footer={allowTaxonomyCreate ? (
          <QuickCreate
            label="作品"
            type="fandom"
            onCreated={addCreatedTaxonomy}
          />
        ) : null}
      />
      <Picker
        label="キャラクター"
        name="characterTagIds"
        options={characters}
        selected={selectedCharacters}
        onToggle={(id, checked) => toggle(setSelectedCharacters, id, checked)}
        emptyMessage={selectedFandoms.length ? "この作品には未登録です。" : "作品を選択すると表示されます。"}
        footer={allowTaxonomyCreate ? (
          <QuickCreate
            label="キャラクター"
            type="character"
            parentOptions={selectedFandomOptions}
            onCreated={addCreatedTaxonomy}
          />
        ) : null}
      />
      <Picker
        label="カップリング"
        name="pairingTagIds"
        options={pairings}
        selected={selectedPairings}
        onToggle={(id, checked) => toggle(setSelectedPairings, id, checked)}
        emptyMessage={selectedFandoms.length ? "この作品には未登録です。" : "作品を選択すると表示されます。"}
        footer={allowTaxonomyCreate ? (
          <QuickCreate
            label="カップリング"
            type="pairing"
            parentOptions={selectedFandomOptions}
            onCreated={addCreatedTaxonomy}
          />
        ) : null}
      />
    </>
  );
}
