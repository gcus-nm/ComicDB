import { requireRequestUser } from "@/lib/auth";
import { previewGoogleSheetPull } from "@/lib/google-sheets";
import { assertMutationAllowed, errorResponse } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const user = requireRequestUser(request);
    assertMutationAllowed(request);
    return Response.json(await previewGoogleSheetPull(user.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
