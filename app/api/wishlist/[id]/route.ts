import { requireRequestUser } from "@/lib/auth";
import { deleteWishlistItem, updateWishlistItem } from "@/lib/catalog";
import { assertMutationAllowed, errorResponse, HttpError } from "@/lib/security";
import { wishlistItemUpdateSchema } from "@/lib/validators";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireRequestUser(request);
    assertMutationAllowed(request);
    const { id } = await context.params;
    const input = wishlistItemUpdateSchema.parse(await request.json());
    const item = updateWishlistItem(id, input);
    if (!item) throw new HttpError(404, "ほしいものが見つかりません。");
    return Response.json(item);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireRequestUser(request);
    assertMutationAllowed(request);
    const { id } = await context.params;
    if (!deleteWishlistItem(id)) {
      throw new HttpError(404, "ほしいものが見つかりません。");
    }
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
