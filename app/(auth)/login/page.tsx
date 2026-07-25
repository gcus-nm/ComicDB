import { redirect } from "next/navigation";
import { currentUser, userExists } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "ログイン" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!userExists()) redirect("/setup");
  if (await currentUser()) redirect("/");
  return (
    <>
      <div className="auth-copy">
        <span className="eyebrow">WELCOME BACK</span>
        <h1>コレクションを開く</h1>
        <p>VPN内のプライベートな蔵書棚です。</p>
      </div>
      <AuthForm mode="login" />
    </>
  );
}
