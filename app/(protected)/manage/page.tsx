import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  DatabaseBackup,
  FileSpreadsheet,
} from "lucide-react";
import { TaxonomyManager } from "@/components/taxonomy-manager";
import { listEvents, listTaxonomyTags } from "@/lib/catalog";

export const metadata = { title: "管理" };

export default function ManagePage() {
  const events = listEvents();
  const taxonomies = listTaxonomyTags();

  return (
    <div className="page-stack settings-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">MANAGEMENT</span>
          <h1>管理</h1>
          <p>イベントと分類マスター、データの入出力を管理します。</p>
        </div>
      </header>

      <div className="manage-grid">
        <Link href="/events" className="manage-card">
          <span><CalendarDays size={22} /></span>
          <div>
            <h2>イベント管理</h2>
            <p>イベントを作成し、購入品を連続登録します。</p>
            <small>{events.length}件のイベント</small>
          </div>
          <ChevronRight size={20} />
        </Link>
        <Link href="/settings#csv-manager" className="manage-card">
          <span><FileSpreadsheet size={22} /></span>
          <div>
            <h2>CSV入出力</h2>
            <p>一括登録、事前確認、全件エクスポート。</p>
          </div>
          <ChevronRight size={20} />
        </Link>
        <Link href="/settings#backup-manager" className="manage-card">
          <span><DatabaseBackup size={22} /></span>
          <div>
            <h2>バックアップ</h2>
            <p>完全バックアップの実行状況を確認します。</p>
          </div>
          <ChevronRight size={20} />
        </Link>
      </div>

      <TaxonomyManager tags={taxonomies} />
    </div>
  );
}
