import { deleteBook, getBook, updateBook } from "@/lib/catalog";
import { requireRequestUser } from "@/lib/auth";
import { removeStoredMedia } from "@/lib/images";
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
    const input = bookInputSchema.parse(await request.json());
    const book = updateBook(id, input);
    if (!book) throw new HttpError(404, "蔵書が見つかりません。");
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
