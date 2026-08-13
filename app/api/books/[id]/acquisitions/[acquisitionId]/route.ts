import { requireRequestUser } from "@/lib/auth";
import { updateAcquisition } from "@/lib/catalog";
import { assertMutationAllowed, errorResponse, HttpError } from "@/lib/security";
import { acquisitionInputSchema } from "@/lib/validators";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; acquisitionId: string }> },
) {
  try {
    requireRequestUser(request);
    assertMutationAllowed(request);
    const { id, acquisitionId } = await context.params;
    const input = acquisitionInputSchema.parse(await request.json());
    const book = updateAcquisition(id, acquisitionId, input);
    if (!book) throw new HttpError(404, "購入履歴が見つかりません。");
    return Response.json(book);
  } catch (error) {
    return errorResponse(error);
  }
}
