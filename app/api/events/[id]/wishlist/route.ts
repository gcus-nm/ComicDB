import { requireRequestUser } from "@/lib/auth";
import {
  createWishlistItem,
  getEvent,
  listWishlistItems,
} from "@/lib/catalog";
import { isEventDayWithinEvent } from "@/lib/event-dates";
import { removeStoredMedia, saveCover } from "@/lib/images";
import { wishlistFormDataObject } from "@/lib/request";
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
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    const formData = contentType.startsWith("multipart/form-data")
      ? await request.formData()
      : null;
    const input = wishlistItemInputSchema.parse(
      formData ? wishlistFormDataObject(formData) : await request.json(),
    );
    const event = getEvent(id);
    if (!event) throw new HttpError(404, "イベントが見つかりません。");
    if (
      !isEventDayWithinEvent(
        event.starts_on,
        event.ends_on,
        input.eventDay,
      )
    ) {
      throw new HttpError(400, "対象日はイベント開催期間内を指定してください。");
    }
    const cover = formData?.get("cover");
    const media = cover instanceof File ? await saveCover(cover) : null;
    let item;
    try {
      item = createWishlistItem(id, input, media);
    } catch (error) {
      if (media) {
        await removeStoredMedia([media.coverPath, media.thumbnailPath]);
      }
      throw error;
    }
    if (!item) {
      if (media) {
        await removeStoredMedia([media.coverPath, media.thumbnailPath]);
      }
      throw new HttpError(404, "イベントが見つかりません。");
    }
    return Response.json(item, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
