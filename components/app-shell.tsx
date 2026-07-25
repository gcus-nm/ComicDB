import Link from "next/link";
import {
  BookOpen,
  Home,
  LibraryBig,
  Plus,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import { PwaRegister } from "./pwa-register";

const navigation = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/books", label: "蔵書", icon: LibraryBig },
  { href: "/manage", label: "管理", icon: SlidersHorizontal },
  { href: "/settings", label: "設定", icon: Settings },
];

export function AppShell({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app-frame">
      <PwaRegister />
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="ComicDB ホーム">
          <span className="brand-mark">
            <BookOpen size={21} strokeWidth={2.4} />
          </span>
          <span>
            <strong>ComicDB</strong>
            <small>同人誌コレクション</small>
          </span>
        </Link>
        <nav className="side-nav" aria-label="メインナビゲーション">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <Icon size={19} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-account">
          <span>{username}</span>
          <small>Private collection</small>
        </div>
      </aside>

      <div className="main-column">
        <header className="mobile-header">
          <Link href="/" className="brand compact">
            <span className="brand-mark">
              <BookOpen size={18} />
            </span>
            <strong>ComicDB</strong>
          </Link>
          <Link href="/books/new" className="icon-button" aria-label="蔵書を追加">
            <Plus size={21} />
          </Link>
        </header>
        <main className="content">{children}</main>
      </div>

      <nav className="bottom-nav" aria-label="モバイルナビゲーション">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}>
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
