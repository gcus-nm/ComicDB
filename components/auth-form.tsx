"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";

export function AuthForm({ mode }: { mode: "setup" | "login" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const setup = mode === "setup";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch(setup ? "/api/setup" : "/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ComicDB-Request": "1",
      },
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "処理に失敗しました。");
      setPending(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label>
        ユーザー名
        <input
          name="username"
          autoComplete="username"
          minLength={3}
          maxLength={64}
          required
          autoFocus
        />
      </label>
      <label>
        パスワード
        <input
          name="password"
          type="password"
          autoComplete={setup ? "new-password" : "current-password"}
          minLength={setup ? 12 : undefined}
          maxLength={128}
          required
        />
        {setup ? <small>12文字以上。復旧用にパスワード管理アプリへ保存してください。</small> : null}
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="primary-button wide" type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={18} /> : <LockKeyhole size={18} />}
        {setup ? "管理者を作成する" : "ログイン"}
        {!pending ? <ArrowRight size={18} /> : null}
      </button>
    </form>
  );
}
