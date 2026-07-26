import { requireRequestUser } from "@/lib/auth";
import {
  createWishlistItem,
  getEvent,
  listWishlistItems,
} from "@/lib/catalog";
import { assertMutationAllowed, errorResponse, HttpError } from "@/lib/security";
import { wishlistItemInputSchema } from "@/lib/validators";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireRequestUser(request);
    const { id } = await context.params;
    if (!getEvent(id)) throw new HttpError(404, "イベントが見つかりません。");
    return Response.json({ items: listWishlistItems(id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireRequestUser(request);
    assertMutationAllowed(request);
    const { id } = await context.params;
    const input = wishlistItemInputSchema.parse(await request.json());
    const item = createWishlistItem(id, input);
    if (!item) throw new HttpError(404, "イベントが見つかりません。");
    return Response.json(item, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
