import { requireRequestUser } from "@/lib/auth";
import {
  deleteWishlistItem,
  getEvent,
  getWishlistItem,
  getWishlistItemMediaPaths,
  updateWishlistItem,
} from "@/lib/catalog";
import { isEventDayWithinEvent } from "@/lib/event-dates";
import { removeStoredMedia, saveCover } from "@/lib/images";
import { wishlistFormDataObject } from "@/lib/request";
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
    const current = getWishlistItem(id);
    if (!current) throw new HttpError(404, "ほしいものが見つかりません。");
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    const formData = contentType.startsWith("multipart/form-data")
      ? await request.formData()
      : null;
    const input = wishlistItemUpdateSchema.parse(
      formData ? wishlistFormDataObject(formData) : await request.json(),
    );
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
    let media:
      | Awaited<ReturnType<typeof saveCover>>
      | null
      | undefined;
    if (formData) {
      const cover = formData.get("cover");
      if (current.bookId && (
        (cover instanceof File && cover.size > 0) ||
        formData.get("removeCover") === "true"
      )) {
        throw new HttpError(
          409,
          "購入済みの表紙は蔵書編集画面から変更してください。",
        );
      }
      if (cover instanceof File && cover.size > 0) {
        media = await saveCover(cover);
      } else if (formData.get("removeCover") === "true") {
        media = null;
      }
    }
    const previousMediaPaths = getWishlistItemMediaPaths(id);
    let item;
    try {
      item = updateWishlistItem(id, input, media);
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
      throw new HttpError(404, "ほしいものが見つかりません。");
    }
    if (media !== undefined && previousMediaPaths.length > 0) {
      try {
        await removeStoredMedia(previousMediaPaths);
      } catch (error) {
        console.error(
          "Updated wishlist item, but failed to remove its previous cover.",
          error,
        );
      }
    }
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
    const current = getWishlistItem(id);
    if (!current) throw new HttpError(404, "ほしいものが見つかりません。");
    const mediaPaths = current.bookId ? [] : getWishlistItemMediaPaths(id);
    if (!deleteWishlistItem(id)) {
      throw new HttpError(404, "ほしいものが見つかりません。");
    }
    if (mediaPaths.length > 0) {
      try {
        await removeStoredMedia(mediaPaths);
      } catch (error) {
        console.error("Deleted wishlist item, but failed to remove its cover.", error);
      }
    }
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
