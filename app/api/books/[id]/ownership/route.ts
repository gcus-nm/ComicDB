import { requireRequestUser } from "@/lib/auth";
import { setBookOwnershipStatus } from "@/lib/catalog";
import { assertMutationAllowed, errorResponse, HttpError } from "@/lib/security";
import { ownershipStatusInputSchema } from "@/lib/validators";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireRequestUser(request);
    assertMutationAllowed(request);
    const { id } = await context.params;
    const input = ownershipStatusInputSchema.parse(await request.json());
    const book = setBookOwnershipStatus(id, input.ownershipStatus);
    if (!book) throw new HttpError(404, "蔵書が見つかりません。");
    return Response.json(book);
  } catch (error) {
    return errorResponse(error);
  }
}
