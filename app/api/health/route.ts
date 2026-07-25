import { getDb } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    getDb().sqlite.prepare("SELECT 1").get();
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
