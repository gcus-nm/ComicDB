import {
  deleteBook,
  getBook,
  getBookMediaPaths,
  updateBook,
} from "@/lib/catalog";
import { requireRequestUser } from "@/lib/auth";
import { removeStoredMedia, saveCover } from "@/lib/images";
import { formDataObject } from "@/lib/request";
import { assertMutationAllowed, errorResponse, HttpError } from "@/lib/security";
import { bookInputSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireRequestUser(request);
    const { id } = await context.params;
    const book = getBook(id);
    if (!book) throw new HttpError(404, "蔵書が見つかりません。");
    return Response.json(book);
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
    const previousMediaPaths = getBookMediaPaths(id);
    if (!previousMediaPaths) {
      throw new HttpError(404, "蔵書が見つかりません。");
    }

    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    let media:
      | Awaited<ReturnType<typeof saveCover>>
      | null
      | undefined;
    let input: Parameters<typeof updateBook>[1];
    if (contentType.startsWith("multipart/form-data")) {
      const formData = await request.formData();
      input = bookInputSchema.parse(formDataObject(formData));
      const cover = formData.get("cover");
      if (cover instanceof File && cover.size > 0) {
        media = await saveCover(cover);
      } else if (formData.get("removeCover") === "true") {
        media = null;
      }
    } else {
      input = bookInputSchema.parse(await request.json());
    }

    let book;
    try {
      book = updateBook(id, input, media);
    } catch (error) {
      if (media) {
        try {
          await removeStoredMedia([media.coverPath, media.thumbnailPath]);
        } catch (cleanupError) {
          console.error("Failed to remove an unused replacement cover.", cleanupError);
        }
      }
      throw error;
    }
    if (!book) {
      if (media) {
        await removeStoredMedia([media.coverPath, media.thumbnailPath]);
      }
      throw new HttpError(404, "蔵書が見つかりません。");
    }
    if (media !== undefined && previousMediaPaths.length > 0) {
      try {
        await removeStoredMedia(previousMediaPaths);
      } catch (error) {
        console.error("Updated book, but failed to remove its previous cover.", error);
      }
    }
    return Response.json(book);
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
    const mediaPaths = deleteBook(id);
    if (!mediaPaths) throw new HttpError(404, "蔵書が見つかりません。");
    try {
      await removeStoredMedia(mediaPaths);
    } catch (error) {
      console.error("Deleted book, but failed to remove its media files.", error);
    }
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
