"use client";

import { useRef, useState } from "react";
import { Download, FileText, LoaderCircle, Upload } from "lucide-react";

type PreviewRow = {
  rowNumber: number;
  input: { title: string; circles: string; eventName: string };
  errors: string[];
  duplicateCount: number;
};

export function CsvManager() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(endpoint: "preflight" | "import") {
    if (!file) return;
    setPending(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/csv/${endpoint}`, {
        method: "POST",
        headers: { "X-ComicDB-Request": "1" },
        body: form,
      });
      const body = (await response.json()) as {
        rows?: PreviewRow[];
        imported?: number;
        error?: string;
      };
      if (!response.ok) {
        setMessage(body.error ?? "CSVを処理できませんでした。");
      } else if (endpoint === "preflight") {
        setRows(body.rows ?? []);
        const invalid =
          body.rows?.filter((row) => row.errors.length).length ?? 0;
        setMessage(
          invalid
            ? `${invalid}行に修正が必要です。`
            : "内容を確認して取込を実行してください。",
        );
      } else {
        setMessage(`${body.imported ?? 0}タイトルを取り込みました。`);
        setRows([]);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    } catch {
      setMessage("通信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setPending(false);
    }
  }

  const invalid = rows.some((row) => row.errors.length);
  return (
    <div className="settings-card" id="csv-manager">
      <div className="settings-card-icon"><FileText size={22} /></div>
      <div className="settings-card-body">
        <h2>CSV入出力</h2>
        <p>CSVで蔵書を事前確認してから取り込み、または全件を書き出せます。</p>
        <div className="button-row">
          <a href="/api/csv/template" className="secondary-button" aria-label="CSVテンプレート"><Download size={17} />テンプレート</a>
          <a href="/api/csv/export" className="secondary-button" aria-label="CSV全件エクスポート"><Download size={17} />全件エクスポート</a>
        </div>
        <label className="file-drop">
          <Upload size={22} />
          <span>{file?.name ?? "CSVファイルを選択"}</span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setRows([]);
              setMessage("");
            }}
          />
        </label>
        {file && !rows.length ? (
          <button className="primary-button" type="button" onClick={() => upload("preflight")} disabled={pending}>
            {pending ? <LoaderCircle className="spin" size={18} /> : <FileText size={18} />}内容を確認
          </button>
        ) : null}
        {rows.length ? (
          <>
            <div className="csv-preview">
              <table>
                <thead><tr><th>行</th><th>タイトル</th><th>サークル</th><th>イベント</th><th>確認</th></tr></thead>
                <tbody>
                  {rows.slice(0, 100).map((row) => (
                    <tr key={row.rowNumber} className={row.errors.length ? "invalid" : ""}>
                      <td>{row.rowNumber}</td><td>{row.input.title}</td><td>{row.input.circles}</td>
                      <td>{row.input.eventName}</td>
                      <td>{row.errors.join(" / ") || (row.duplicateCount ? `重複候補 ${row.duplicateCount}` : "OK")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="primary-button" type="button" onClick={() => upload("import")} disabled={pending || invalid}>
              {pending ? <LoaderCircle className="spin" size={18} /> : <Upload size={18} />}
              {rows.length}行を取り込む
            </button>
          </>
        ) : null}
        {message ? <p className="inline-message" role="status">{message}</p> : null}
      </div>
    </div>
  );
}
