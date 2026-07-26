import { requireRequestUser } from "@/lib/auth";
import { applyGoogleSheetPush } from "@/lib/google-sheets";
import { assertMutationAllowed, errorResponse, HttpError } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const user = requireRequestUser(request);
    assertMutationAllowed(request);
    const body = (await request.json()) as {
      sourceHash?: unknown;
      force?: unknown;
    };
    if (typeof body.sourceHash !== "string") {
      throw new HttpError(400, "事前確認結果がありません。");
    }
    return Response.json(
      await applyGoogleSheetPush(
        user.id,
        body.sourceHash,
        body.force === true,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
