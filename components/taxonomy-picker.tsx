"use client";

import { useState } from "react";
import Link from "next/link";
import type { TaxonomyTag } from "@/lib/catalog";

function Picker({
  label,
  name,
  options,
  selected,
  onToggle,
  emptyMessage,
}: {
  label: string;
  name: "fandomTagIds" | "characterTagIds" | "pairingTagIds";
  options: TaxonomyTag[];
  selected: string[];
  onToggle: (id: string, checked: boolean) => void;
  emptyMessage: string;
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
    </fieldset>
  );
}

export function TaxonomyFields({
  taxonomies,
  selectedFandomIds = [],
  selectedCharacterIds = [],
  selectedPairingIds = [],
}: {
  taxonomies: TaxonomyTag[];
  selectedFandomIds?: string[];
  selectedCharacterIds?: string[];
  selectedPairingIds?: string[];
}) {
  const fandoms = taxonomies.filter((tag) => tag.type === "fandom");
  const [selectedFandoms, setSelectedFandoms] = useState(selectedFandomIds);
  const [selectedCharacters, setSelectedCharacters] = useState(selectedCharacterIds);
  const [selectedPairings, setSelectedPairings] = useState(selectedPairingIds);
  const childIsVisible = (tag: TaxonomyTag) =>
    !tag.parentId || selectedFandoms.includes(tag.parentId);
  const characters = taxonomies.filter(
    (tag) => tag.type === "character" && childIsVisible(tag),
  );
  const pairings = taxonomies.filter(
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
          const tag = taxonomies.find((item) => item.id === tagId);
          return !tag?.parentId || tag.parentId !== id;
        }),
      );
      setSelectedPairings((current) =>
        current.filter((tagId) => {
          const tag = taxonomies.find((item) => item.id === tagId);
          return !tag?.parentId || tag.parentId !== id;
        }),
      );
    }
  }

  if (!fandoms.length) {
    return (
      <div className="taxonomy-empty span-2">
        原作がまだ登録されていません。
        <Link href="/manage#taxonomy-manager">管理画面で原作を追加</Link>
      </div>
    );
  }

  return (
    <>
      <Picker
        label="原作"
        name="fandomTagIds"
        options={fandoms}
        selected={selectedFandoms}
        onToggle={toggleFandom}
        emptyMessage="原作がありません。"
      />
      <Picker
        label="キャラクター"
        name="characterTagIds"
        options={characters}
        selected={selectedCharacters}
        onToggle={(id, checked) => toggle(setSelectedCharacters, id, checked)}
        emptyMessage={selectedFandoms.length ? "この原作には未登録です。" : "原作を選択すると表示されます。"}
      />
      <Picker
        label="カップリング"
        name="pairingTagIds"
        options={pairings}
        selected={selectedPairings}
        onToggle={(id, checked) => toggle(setSelectedPairings, id, checked)}
        emptyMessage={selectedFandoms.length ? "この原作には未登録です。" : "原作を選択すると表示されます。"}
      />
    </>
  );
}
