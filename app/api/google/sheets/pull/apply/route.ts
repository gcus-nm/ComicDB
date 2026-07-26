import { requireRequestUser } from "@/lib/auth";
import { applyGoogleSheetPull } from "@/lib/google-sheets";
import { assertMutationAllowed, errorResponse, HttpError } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const user = requireRequestUser(request);
    assertMutationAllowed(request);
    const body = (await request.json()) as { sourceHash?: unknown };
    if (typeof body.sourceHash !== "string") {
      throw new HttpError(400, "事前確認結果がありません。");
    }
    return Response.json(
      await applyGoogleSheetPull(user.id, body.sourceHash),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
