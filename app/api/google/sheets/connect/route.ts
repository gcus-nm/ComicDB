import { requireRequestUser } from "@/lib/auth";
import { connectGoogleSpreadsheet } from "@/lib/google-sheets";
import { assertMutationAllowed, errorResponse, HttpError } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const user = requireRequestUser(request);
    assertMutationAllowed(request);
    const body = (await request.json()) as {
      spreadsheetId?: unknown;
      sheetId?: unknown;
    };
    if (typeof body.spreadsheetId !== "string") {
      throw new HttpError(400, "スプレッドシートを選択してください。");
    }
    if (
      body.sheetId !== undefined &&
      (typeof body.sheetId !== "number" || !Number.isInteger(body.sheetId))
    ) {
      throw new HttpError(400, "管理タブの指定が不正です。");
    }
    return Response.json(
      await connectGoogleSpreadsheet(
        user.id,
        body.spreadsheetId,
        body.sheetId as number | undefined,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
