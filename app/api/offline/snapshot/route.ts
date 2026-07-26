import { requireRequestUser } from "@/lib/auth";
import { listBooks } from "@/lib/catalog";
import { errorResponse } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireRequestUser(request);
    const result = listBooks({ ownershipStatus: "all", limit: 100_000 });
    return Response.json({
      version: Date.now(),
      generatedAt: new Date().toISOString(),
      books: result.books,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
