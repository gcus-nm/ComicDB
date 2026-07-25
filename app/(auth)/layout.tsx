import { BookOpen } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand">
          <span className="brand-mark large">
            <BookOpen size={30} />
          </span>
          <span>
            <strong>ComicDB</strong>
            <small>あなたの同人誌コレクション</small>
          </span>
        </div>
        {children}
      </section>
      <aside className="auth-art" aria-hidden="true">
        <div className="book-spines">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <p>集めた記憶を、<br />いつでも手のひらに。</p>
      </aside>
    </main>
  );
}
