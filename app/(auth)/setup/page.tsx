import { redirect } from "next/navigation";
import { userExists } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "初期設定" };
export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (userExists()) redirect("/login");
  return (
    <>
      <div className="auth-copy">
        <span className="eyebrow">FIRST SETUP</span>
        <h1>最初の管理者を作成</h1>
        <p>このアカウントだけが蔵書へアクセスできます。</p>
      </div>
      <AuthForm mode="setup" />
    </>
  );
}
