import { requireRequestUser } from "@/lib/auth";
import { findDuplicateCandidates } from "@/lib/catalog";
import { errorResponse } from "@/lib/security";

export async function GET(request: Request) {
  try {
    requireRequestUser(request);
    const url = new URL(request.url);
    return Response.json({
      candidates: findDuplicateCandidates(
        url.searchParams.get("title") ?? "",
        url.searchParams.get("circle") ?? "",
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
