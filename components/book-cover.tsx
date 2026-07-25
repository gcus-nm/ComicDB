"use client";

import { useState } from "react";
import { BookOpen, Eye, EyeOff } from "lucide-react";
import { useR18Reveal } from "@/lib/client-preferences";

export function BookCover({
  src,
  title,
  adultRating,
  className = "",
}: {
  src: string | null;
  title: string;
  adultRating: "general" | "r18";
  className?: string;
}) {
  const revealByDefault = useR18Reveal();
  const [temporaryReveal, setTemporaryReveal] = useState(false);
  const revealed = revealByDefault || temporaryReveal;
  const obscured = adultRating === "r18" && !revealed;

  return (
    <div className={`cover-frame ${className}`}>
      {src ? (
        // Uploaded media is served by an authenticated same-origin endpoint.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${title}の表紙`} className={obscured ? "cover-blur" : ""} />
      ) : (
        <div className="cover-placeholder" aria-label="表紙未登録">
          <BookOpen size={34} />
          <span>NO COVER</span>
        </div>
      )}
      {adultRating === "r18" ? (
        <button
          type="button"
          className="cover-reveal"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setTemporaryReveal((value) => !value);
          }}
          aria-label={obscured ? "R18表紙を表示" : "R18表紙を隠す"}
        >
          {obscured ? <Eye size={16} /> : <EyeOff size={16} />}
          R18
        </button>
      ) : null}
    </div>
  );
}
