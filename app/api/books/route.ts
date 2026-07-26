import { createBook, listBooks } from "@/lib/catalog";
import { requireRequestUser } from "@/lib/auth";
import { saveCover } from "@/lib/images";
import { formDataObject } from "@/lib/request";
import { assertMutationAllowed, errorResponse } from "@/lib/security";
import { bookInputSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireRequestUser(request);
    const url = new URL(request.url);
    return Response.json(
      listBooks({
        q: url.searchParams.get("q") ?? "",
        adultRating: url.searchParams.get("adultRating") ?? "",
        readStatus: url.searchParams.get("readStatus") ?? "",
        ownershipStatus: url.searchParams.get("ownershipStatus") ?? undefined,
        favorite: url.searchParams.get("favorite") === "true",
        eventId: url.searchParams.get("eventId") ?? "",
        storageId: url.searchParams.get("storageId") ?? "",
        tag: url.searchParams.get("tag") ?? "",
        page: Number(url.searchParams.get("page") ?? 1),
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireRequestUser(request);
    assertMutationAllowed(request);
    const formData = await request.formData();
    const input = bookInputSchema.parse(formDataObject(formData));
    const cover = formData.get("cover");
    const media = cover instanceof File ? await saveCover(cover) : null;
    return Response.json(createBook(input, media), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
