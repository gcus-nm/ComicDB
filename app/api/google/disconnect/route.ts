import { requireRequestUser } from "@/lib/auth";
import { disconnectGoogle } from "@/lib/google-auth";
import { assertMutationAllowed, errorResponse } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const user = requireRequestUser(request);
    assertMutationAllowed(request);
    await disconnectGoogle(user.id);
    return Response.json(
      { disconnected: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
