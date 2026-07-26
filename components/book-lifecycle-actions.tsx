"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveX, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import type { OwnershipStatus } from "@/lib/types";

export function BookLifecycleActions({
  bookId,
  title,
  ownershipStatus,
}: {
  bookId: string;
  title: string;
  ownershipStatus: OwnershipStatus;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"status" | "delete" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");

  async function changeOwnershipStatus() {
    const nextStatus = ownershipStatus === "owned" ? "disposed" : "owned";
    if (
      nextStatus === "disposed" &&
      !window.confirm(
        "この本を処分済みにしますか？ 購入履歴は残り、あとから所持中へ戻せます。",
      )
    ) {
      return;
    }
    setPending("status");
    setMessage("");
    const response = await fetch(`/api/books/${bookId}/ownership`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-ComicDB-Request": "1",
      },
      body: JSON.stringify({ ownershipStatus: nextStatus }),
    });
    const body = (await response.json()) as { error?: string };
    setMessage(
      response.ok
        ? nextStatus === "disposed"
          ? "処分済みに変更しました。"
          : "所持中へ戻しました。"
        : (body.error ?? "所持状態の変更に失敗しました。"),
    );
    setPending(null);
    if (response.ok) router.refresh();
  }

  async function permanentlyDelete() {
    if (confirmation !== title) return;
    setPending("delete");
    setMessage("");
    const response = await fetch(`/api/books/${bookId}`, {
      method: "DELETE",
      headers: { "X-ComicDB-Request": "1" },
    });
    const body = (await response.json()) as { error?: string };
    if (response.ok) {
      router.push("/books");
      router.refresh();
      return;
    }
    setMessage(body.error ?? "完全削除に失敗しました。");
    setPending(null);
  }

  return (
    <section className="book-lifecycle-panel">
      <div className="book-lifecycle-copy">
        <span className="eyebrow">OWNERSHIP</span>
        <h2>所持状態</h2>
        <p>
          {ownershipStatus === "owned"
            ? "現在所持しています。処分済みにしても購入履歴と蔵書情報は残ります。"
            : "処分済みとして記録されています。再入手した場合は所持中へ戻せます。"}
        </p>
      </div>
      <button
        className="secondary-button"
        type="button"
        onClick={changeOwnershipStatus}
        disabled={pending !== null}
      >
        {pending === "status" ? (
          <LoaderCircle className="spin" size={18} />
        ) : ownershipStatus === "owned" ? (
          <ArchiveX size={18} />
        ) : (
          <RotateCcw size={18} />
        )}
        {ownershipStatus === "owned" ? "処分済みにする" : "所持中へ戻す"}
      </button>

      <details className="danger-zone">
        <summary>誤登録した蔵書を完全削除</summary>
        <div className="danger-zone-body">
          <p>
            購入履歴、表紙画像、関連付けも削除されます。この操作は元に戻せません。
          </p>
          <label>
            確認のためタイトル「<strong>{title}</strong>」を入力
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
          </label>
          <button
            className="danger-button"
            type="button"
            onClick={permanentlyDelete}
            disabled={pending !== null || confirmation !== title}
          >
            {pending === "delete" ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Trash2 size={18} />
            )}
            完全に削除する
          </button>
        </div>
      </details>
      {message ? <p className="inline-message lifecycle-message" role="status">{message}</p> : null}
    </section>
  );
}
