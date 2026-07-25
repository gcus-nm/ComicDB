"use client";

import { useEffect, useState } from "react";
import { DatabaseBackup, HardDrive, LoaderCircle } from "lucide-react";

type Status = {
  lastBackupAt: string | null;
  lastBackupName: string | null;
  dataBytes: number;
  backupBytes: number;
};

function bytes(value: number) {
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function BackupManager() {
  const [status, setStatus] = useState<Status | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const load = () => fetch("/api/backup").then((response) => response.json()).then(setStatus);
  useEffect(() => { void load(); }, []);

  async function backup() {
    setPending(true);
    setMessage("");
    const response = await fetch("/api/backup", {
      method: "POST",
      headers: { "X-ComicDB-Request": "1" },
    });
    const body = (await response.json()) as { name?: string; error?: string };
    setMessage(response.ok ? `${body.name} を作成しました。` : (body.error ?? "バックアップに失敗しました。"));
    await load();
    setPending(false);
  }

  return (
    <div className="settings-card" id="backup-manager">
      <div className="settings-card-icon"><DatabaseBackup size={22} /></div>
      <div className="settings-card-body">
        <h2>バックアップ</h2>
        <p>データベースと表紙を外付けHDDへまとめ、30世代保持します。</p>
        {status ? (
          <div className="backup-stats">
            <span><HardDrive size={16} />通常データ {bytes(status.dataBytes)}</span>
            <span>バックアップ {bytes(status.backupBytes)}</span>
            <span>最終実行 {status.lastBackupAt ? new Date(status.lastBackupAt).toLocaleString("ja-JP") : "未実行"}</span>
          </div>
        ) : null}
        <button className="primary-button" type="button" onClick={backup} disabled={pending}>
          {pending ? <LoaderCircle className="spin" size={18} /> : <DatabaseBackup size={18} />}今すぐバックアップ
        </button>
        {message ? <p className="inline-message">{message}</p> : null}
      </div>
    </div>
  );
}
