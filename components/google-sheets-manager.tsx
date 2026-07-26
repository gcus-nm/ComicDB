"use client";

import { useEffect, useState } from "react";
import {
  ExternalLink,
  Link2,
  Link2Off,
  LoaderCircle,
  RefreshCw,
  Sheet,
  UploadCloud,
} from "lucide-react";

type ConnectionStatus = {
  configured: boolean;
  missing: string[];
  connected: boolean;
  accountEmail: string | null;
  spreadsheet: {
    id: string;
    name: string | null;
    sheetId: number;
    sheetTitle: string;
    url: string;
  } | null;
  lastPushAt: string | null;
  lastPullAt: string | null;
};

type PreviewStatus = "new" | "update" | "unchanged" | "conflict" | "error";
type SyncPreview = {
  sourceHash: string;
  rows: Array<{
    rowNumber: number;
    status: PreviewStatus;
    comicDbId: string | null;
    title: string;
    errors: string[];
    warnings: string[];
    duplicateCount: number;
  }>;
  counts: Record<PreviewStatus, number>;
  warningCount: number;
  normalizationCount: number;
};

type Inspection = {
  spreadsheetId: string;
  name: string;
  candidates: Array<{ sheetId: number; title: string }>;
};

type PickerDocument = { id?: string };
type PickerData = {
  action?: string;
  docs?: PickerDocument[];
};
type PickerBuilder = {
  addView(view: PickerView): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setCallback(callback: (data: PickerData) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
};
type PickerView = {
  setMode(mode: string): PickerView;
  setMimeTypes(mimeTypes: string): PickerView;
};
type PickerNamespace = {
  Action: { PICKED: string; CANCEL: string };
  DocsView: new (viewId: string) => PickerView;
  DocsViewMode: { LIST: string };
  PickerBuilder: new () => PickerBuilder;
  ViewId: { SPREADSHEETS: string };
};

declare global {
  interface Window {
    gapi?: {
      load(
        name: string,
        options: {
          callback: () => void;
          onerror: () => void;
          timeout: number;
          ontimeout: () => void;
        },
      ): void;
    };
    google?: { picker: PickerNamespace };
  }
}

let pickerLoader: Promise<void> | null = null;

function loadPicker() {
  if (window.google?.picker) return Promise.resolve();
  if (pickerLoader) return pickerLoader;
  pickerLoader = new Promise<void>((resolve, reject) => {
    const loadApi = () => {
      if (!window.gapi) {
        reject(new Error("Google APIを読み込めませんでした。"));
        return;
      }
      window.gapi.load("picker", {
        callback: resolve,
        onerror: () => reject(new Error("Google Pickerを読み込めませんでした。")),
        timeout: 10_000,
        ontimeout: () =>
          reject(new Error("Google Pickerの読み込みがタイムアウトしました。")),
      });
    };
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-comicdb-google-picker="1"]',
    );
    if (existing) {
      existing.addEventListener("load", loadApi, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Google APIを読み込めませんでした。")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.dataset.comicdbGooglePicker = "1";
    script.addEventListener("load", loadApi, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Google APIを読み込めませんでした。")),
      { once: true },
    );
    document.head.append(script);
  });
  return pickerLoader;
}

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "X-ComicDB-Request": "1",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "処理に失敗しました。");
  return body;
}

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("ja-JP") : "未実行";
}

const STATUS_LABELS: Record<PreviewStatus, string> = {
  new: "新規",
  update: "更新",
  unchanged: "変更なし",
  conflict: "競合",
  error: "エラー",
};

export function GoogleSheetsManager() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [selectedSheetId, setSelectedSheetId] = useState<number | null>(null);
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [previewMode, setPreviewMode] = useState<"push" | "pull" | null>(null);

  async function loadStatus() {
    try {
      setStatus(await requestJson<ConnectionStatus>("/api/google/status"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "接続状態を取得できませんでした。");
    }
  }

  useEffect(() => {
    let active = true;
    void requestJson<ConnectionStatus>("/api/google/status")
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(
            error instanceof Error ? error.message : "接続状態を取得できませんでした。",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "処理に失敗しました。");
    } finally {
      setPending(false);
    }
  }

  async function connectSelected(
    spreadsheetId: string,
    sheetId?: number,
  ) {
    await requestJson("/api/google/sheets/connect", {
      method: "POST",
      body: JSON.stringify({ spreadsheetId, sheetId }),
    });
    setInspection(null);
    setSelectedSheetId(null);
    setMessage("管理対象のGoogleスプレッドシートを設定しました。");
    await loadStatus();
  }

  async function inspectSelection(spreadsheetId: string) {
    const result = await requestJson<Inspection>("/api/google/sheets/inspect", {
      method: "POST",
      body: JSON.stringify({ spreadsheetId }),
    });
    if (result.candidates.length > 1) {
      setInspection(result);
      setSelectedSheetId(result.candidates[0]?.sheetId ?? null);
      setMessage("管理対象にするタブを選択してください。");
      return;
    }
    await connectSelected(
      result.spreadsheetId,
      result.candidates[0]?.sheetId,
    );
  }

  function openPicker() {
    void run(async () => {
      await loadPicker();
      const token = await requestJson<{
        accessToken: string;
        pickerApiKey: string;
        projectNumber: string;
      }>("/api/google/picker-token");
      const pickerApi = window.google?.picker;
      if (!pickerApi) throw new Error("Google Pickerを初期化できませんでした。");
      const view = new pickerApi.DocsView(pickerApi.ViewId.SPREADSHEETS)
        .setMode(pickerApi.DocsViewMode.LIST)
        .setMimeTypes("application/vnd.google-apps.spreadsheet");
      new pickerApi.PickerBuilder()
        .addView(view)
        .setOAuthToken(token.accessToken)
        .setDeveloperKey(token.pickerApiKey)
        .setAppId(token.projectNumber)
        .setCallback((data) => {
          if (data.action !== pickerApi.Action.PICKED) return;
          const spreadsheetId = data.docs?.[0]?.id;
          if (!spreadsheetId) {
            setMessage("スプレッドシートを取得できませんでした。");
            return;
          }
          void run(() => inspectSelection(spreadsheetId));
        })
        .build()
        .setVisible(true);
    });
  }

  function preflight(mode: "push" | "pull") {
    void run(async () => {
      const result = await requestJson<SyncPreview>(
        `/api/google/sheets/${mode}/preflight`,
        { method: "POST" },
      );
      setPreview(result);
      setPreviewMode(mode);
      setMessage(
        mode === "pull"
          ? "シートの差分を確認しました。競合とエラーは取り込みません。"
          : "上書き前にシートの未取込差分を確認しました。",
      );
    });
  }

  function applyPull() {
    if (!preview || previewMode !== "pull") return;
    void run(async () => {
      const result = await requestJson<{
        created: number;
        updated: number;
        conflicts: number;
        errors: number;
      }>("/api/google/sheets/pull/apply", {
        method: "POST",
        body: JSON.stringify({ sourceHash: preview.sourceHash }),
      });
      setPreview(null);
      setPreviewMode(null);
      setMessage(
        `新規${result.created}件・更新${result.updated}件を取り込みました。競合${result.conflicts}件・エラー${result.errors}件は保留しています。`,
      );
      await loadStatus();
    });
  }

  function applyPush() {
    if (!preview || previewMode !== "push") return;
    const overwriteCount =
      preview.counts.new +
      preview.counts.update +
      preview.counts.conflict +
      preview.counts.error +
      preview.warningCount;
    void run(async () => {
      const result = await requestJson<{ exported: number }>(
        "/api/google/sheets/push/apply",
        {
          method: "POST",
          body: JSON.stringify({
            sourceHash: preview.sourceHash,
            force: overwriteCount > 0,
          }),
        },
      );
      setPreview(null);
      setPreviewMode(null);
      setMessage(`${result.exported}件を管理タブへ反映しました。`);
      await loadStatus();
    });
  }

  const validPullCount =
    (preview?.counts.new ?? 0) +
    (preview?.counts.update ?? 0) +
    (preview?.normalizationCount ?? 0);
  const pushOverwriteCount = preview
    ? preview.rows.filter(
        (row) => row.status !== "unchanged" || row.warnings.length > 0,
      ).length
    : 0;

  return (
    <div className="settings-card" id="google-sheets">
      <div className="settings-card-icon"><Sheet size={22} /></div>
      <div className="settings-card-body">
        <h2>Googleスプレッドシート連携</h2>
        <p>ComicDBを正本に、管理タブだけを手動で送信・取り込みします。</p>

        {!status ? (
          <p className="status-line">接続状態を確認しています…</p>
        ) : !status.configured ? (
          <div className="warning-callout">
            <strong>Google連携は無効です</strong>
            <p>環境変数が不足しています: {status.missing.join(", ")}</p>
          </div>
        ) : !status.connected ? (
          <div className="button-row">
            <a className="primary-button" href="/api/google/oauth/start">
              <Link2 size={18} />個人Googleアカウントを接続
            </a>
          </div>
        ) : (
          <>
            <div className="google-sheet-status">
              <span>接続先 <strong>{status.accountEmail}</strong></span>
              <span>最終送信 {dateTime(status.lastPushAt)}</span>
              <span>最終取込 {dateTime(status.lastPullAt)}</span>
            </div>
            {status.spreadsheet ? (
              <p className="google-sheet-link">
                管理対象:{" "}
                <a href={status.spreadsheet.url} target="_blank" rel="noreferrer">
                  {status.spreadsheet.name ?? "Googleスプレッドシート"} / {status.spreadsheet.sheetTitle}
                  <ExternalLink size={14} />
                </a>
              </p>
            ) : null}
            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    await requestJson("/api/google/sheets/create", {
                      method: "POST",
                    });
                    setMessage("新しいスプレッドシートを作成し、蔵書を反映しました。");
                    await loadStatus();
                  })
                }
              >
                <Sheet size={18} />新規スプレッドシートを作成
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={pending}
                onClick={openPicker}
              >
                <Link2 size={18} />Google Pickerで選択
              </button>
            </div>

            {inspection ? (
              <div className="google-tab-picker">
                <label htmlFor="google-sheet-tab">管理対象タブ</label>
                <select
                  id="google-sheet-tab"
                  value={selectedSheetId ?? ""}
                  onChange={(event) => setSelectedSheetId(Number(event.target.value))}
                >
                  {inspection.candidates.map((candidate) => (
                    <option key={candidate.sheetId} value={candidate.sheetId}>
                      {candidate.title}
                    </option>
                  ))}
                </select>
                <button
                  className="primary-button"
                  type="button"
                  disabled={pending || selectedSheetId === null}
                  onClick={() =>
                    void run(() =>
                      connectSelected(
                        inspection.spreadsheetId,
                        selectedSheetId ?? undefined,
                      ),
                    )
                  }
                >
                  このタブを管理対象にする
                </button>
              </div>
            ) : null}

            {status.spreadsheet ? (
              <div className="button-row">
                <button
                  className="primary-button"
                  type="button"
                  disabled={pending}
                  onClick={() => preflight("push")}
                >
                  <UploadCloud size={18} />シートへ反映
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={pending}
                  onClick={() => preflight("pull")}
                >
                  <RefreshCw size={18} />シートから取込
                </button>
              </div>
            ) : null}

            {preview ? (
              <div className="google-sync-preview">
                <div className="sync-summary">
                  {(["new", "update", "unchanged", "conflict", "error"] as const).map(
                    (key) => (
                      <span key={key}>{STATUS_LABELS[key]} {preview.counts[key]}</span>
                    ),
                  )}
                  <span>警告 {preview.warningCount}</span>
                </div>
                {preview.rows.length ? (
                  <div className="csv-preview">
                    <table>
                      <thead>
                        <tr><th>行</th><th>状態</th><th>タイトル</th><th>確認</th></tr>
                      </thead>
                      <tbody>
                        {preview.rows.slice(0, 100).map((row) => (
                          <tr
                            key={row.rowNumber}
                            className={
                              row.status === "error" || row.status === "conflict"
                                ? "invalid"
                                : ""
                            }
                          >
                            <td>{row.rowNumber}</td>
                            <td>{STATUS_LABELS[row.status]}</td>
                            <td>{row.title || "（タイトルなし）"}</td>
                            <td>
                              {[...row.errors, ...row.warnings].join(" / ") || "OK"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {previewMode === "pull" ? (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={pending || validPullCount === 0}
                    onClick={applyPull}
                  >
                    反映可能な {validPullCount}件を取り込む
                  </button>
                ) : (
                  <button
                    className={pushOverwriteCount ? "danger-button" : "primary-button"}
                    type="button"
                    disabled={pending}
                    onClick={applyPush}
                  >
                    {pushOverwriteCount
                      ? `未取込・警告 ${pushOverwriteCount}件を破棄して上書き`
                      : "管理タブを全件置換"}
                  </button>
                )}
              </div>
            ) : null}

            <div className="button-row">
              <button
                className="ghost-button danger"
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm("Google連携を解除しますか？")) return;
                  void run(async () => {
                    await requestJson("/api/google/disconnect", { method: "POST" });
                    setPreview(null);
                    setMessage("Google連携を解除しました。");
                    await loadStatus();
                  });
                }}
              >
                <Link2Off size={17} />接続を解除
              </button>
            </div>
          </>
        )}
        {pending ? (
          <p className="status-line"><LoaderCircle className="spin" size={15} />処理中です…</p>
        ) : null}
        {message ? <p className="inline-message" role="status">{message}</p> : null}
      </div>
    </div>
  );
}
