import { BackupManager } from "@/components/backup-manager";
import { CsvManager } from "@/components/csv-manager";
import { LogoutButton } from "@/components/logout-button";
import { OfflineManager } from "@/components/offline-manager";
import { PrivacySettings } from "@/components/privacy-settings";

export const metadata = { title: "設定" };

export default function SettingsPage() {
  return (
    <div className="page-stack settings-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">SETTINGS</span>
          <h1>設定</h1>
          <p>端末への保存、データ移行、バックアップを管理します。</p>
        </div>
      </header>
      <OfflineManager />
      <CsvManager />
      <BackupManager />
      <PrivacySettings />
      <div className="logout-row">
        <LogoutButton />
      </div>
    </div>
  );
}
