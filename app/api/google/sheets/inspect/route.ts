import { requireRequestUser } from "@/lib/auth";
import { inspectGoogleSpreadsheet } from "@/lib/google-sheets";
import { assertMutationAllowed, errorResponse, HttpError } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const user = requireRequestUser(request);
    assertMutationAllowed(request);
    const body = (await request.json()) as { spreadsheetId?: unknown };
    if (typeof body.spreadsheetId !== "string") {
      throw new HttpError(400, "スプレッドシートを選択してください。");
    }
    return Response.json(
      await inspectGoogleSpreadsheet(user.id, body.spreadsheetId),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
