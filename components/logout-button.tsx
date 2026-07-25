"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="ghost-button danger"
      type="button"
      onClick={async () => {
        await fetch("/api/logout", {
          method: "POST",
          headers: { "X-ComicDB-Request": "1" },
        });
        router.replace("/login");
        router.refresh();
      }}
    >
      <LogOut size={17} />ログアウト
    </button>
  );
}
