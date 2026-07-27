import { requireRequestUser } from "@/lib/auth";
import {
  deleteWishlistItem,
  getEvent,
  getWishlistItem,
  updateWishlistItem,
} from "@/lib/catalog";
import { isEventDayWithinEvent } from "@/lib/event-dates";
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
    const current = getWishlistItem(id);
    if (!current) throw new HttpError(404, "ほしいものが見つかりません。");
    if (input.eventDay !== undefined) {
      const event = getEvent(current.eventId);
      if (!event) throw new HttpError(404, "イベントが見つかりません。");
      if (
        !isEventDayWithinEvent(
          event.starts_on,
          event.ends_on,
          input.eventDay,
        )
      ) {
        throw new HttpError(
          400,
          "対象日はイベント開催期間内を指定してください。",
        );
      }
    }
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
