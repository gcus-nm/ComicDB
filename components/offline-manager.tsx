"use client";

import { useEffect, useState } from "react";
import { CloudOff, Download, LoaderCircle, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import {
  clearOfflineSnapshot,
  readOfflineSnapshot,
  saveOfflineSnapshot,
  type OfflineSnapshot,
} from "@/lib/offline-client";

export function OfflineManager() {
  const [secure, setSecure] = useState(true);
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void Promise.resolve().then(() => setSecure(window.isSecureContext));
    void readOfflineSnapshot().then(setSnapshot);
  }, []);

  async function update() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/offline/snapshot", { cache: "no-store" });
      if (!response.ok) throw new Error("蔵書データを取得できませんでした。");
      const data = (await response.json()) as OfflineSnapshot;
      await saveOfflineSnapshot(data);
      const cache = await caches.open("comicdb-media-v1");
      const urls = data.books
        .map((book) => book.thumbnailUrl)
        .filter((url): url is string => Boolean(url));
      for (let index = 0; index < urls.length; index += 10) {
        await Promise.allSettled(
          urls.slice(index, index + 10).map((url) => cache.add(new Request(url, { credentials: "include" }))),
        );
      }
      const pages = await caches.open("comicdb-pages-v1");
      await pages.add(new Request("/offline", { credentials: "include" }));
      setSnapshot(data);
      setMessage(`${data.books.length}タイトルを端末へ保存しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新に失敗しました。");
    }
    setPending(false);
  }

  async function clear() {
    await clearOfflineSnapshot();
    setSnapshot(null);
    setMessage("端末上のオフラインデータを削除しました。");
  }

  return (
    <div className="settings-card">
      <div className="settings-card-icon"><CloudOff size={22} /></div>
      <div className="settings-card-body">
        <h2>オフライン所持確認</h2>
        <p>イベント会場で通信できない場合も、保存済みの蔵書を検索できます。</p>
        {!secure ? (
          <div className="warning-callout">
            <ShieldCheck size={18} />
            HTTPSまたはlocalhostで開くと利用できます。現在は安全な接続ではありません。
          </div>
        ) : null}
        {snapshot ? (
          <p className="status-line">
            保存済み：{snapshot.books.length}タイトル · {new Date(snapshot.generatedAt).toLocaleString("ja-JP")}
          </p>
        ) : <p className="status-line">まだ端末へ保存されていません。</p>}
        {message ? <p className="inline-message" role="status">{message}</p> : null}
        <div className="button-row">
          <button className="primary-button" type="button" onClick={update} disabled={!secure || pending}>
            {pending ? <LoaderCircle className="spin" size={18} /> : snapshot ? <RefreshCw size={18} /> : <Download size={18} />}
            {snapshot ? "オフラインデータを更新" : "端末へ保存"}
          </button>
          {snapshot ? (
            <button className="ghost-button danger" type="button" onClick={clear}>
              <Trash2 size={17} />削除
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
