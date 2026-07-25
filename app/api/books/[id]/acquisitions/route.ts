import { requireRequestUser } from "@/lib/auth";
import { addAcquisition } from "@/lib/catalog";
import { assertMutationAllowed, errorResponse, HttpError } from "@/lib/security";
import { acquisitionInputSchema } from "@/lib/validators";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireRequestUser(request);
    assertMutationAllowed(request);
    const { id } = await context.params;
    const input = acquisitionInputSchema.parse(await request.json());
    const book = addAcquisition(id, input);
    if (!book) throw new HttpError(404, "蔵書が見つかりません。");
    return Response.json(book, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
