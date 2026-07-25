import { requireRequestUser } from "@/lib/auth";
import { preflightCsv } from "@/lib/csv";
import { assertMutationAllowed, errorResponse, HttpError } from "@/lib/security";

export async function POST(request: Request) {
  try {
    requireRequestUser(request);
    assertMutationAllowed(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "CSVファイルを選択してください。");
    if (file.size > 5 * 1024 * 1024) throw new HttpError(413, "CSVは5MB以下にしてください。");
    return Response.json({ rows: preflightCsv(await file.text()) });
  } catch (error) {
    return errorResponse(error);
  }
}
