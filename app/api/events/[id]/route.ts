import { requireRequestUser } from "@/lib/auth";
import {
  getEvent,
  hasWishlistItemsOutsideEventRange,
  updateEvent,
} from "@/lib/catalog";
import { assertMutationAllowed, errorResponse, HttpError } from "@/lib/security";
import { eventInputSchema } from "@/lib/validators";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireRequestUser(request);
    const { id } = await context.params;
    const event = getEvent(id);
    if (!event) throw new HttpError(404, "イベントが見つかりません。");
    return Response.json(event);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireRequestUser(request);
    assertMutationAllowed(request);
    const { id } = await context.params;
    const input = eventInputSchema.parse(await request.json());
    if (!getEvent(id)) {
      throw new HttpError(404, "イベントが見つかりません。");
    }
    if (
      hasWishlistItemsOutsideEventRange(
        id,
        input.startsOn,
        input.endsOn || null,
      )
    ) {
      throw new HttpError(
        409,
        "開催期間外になるほしいものがあります。対象日を変更してからイベント期間を短縮してください。",
      );
    }
    const event = updateEvent(id, input);
    if (!event) throw new HttpError(404, "イベントが見つかりません。");
    return Response.json(event);
  } catch (error) {
    return errorResponse(error);
  }
}
