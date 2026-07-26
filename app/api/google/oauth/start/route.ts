import { requireRequestUser } from "@/lib/auth";
import { beginGoogleOAuth } from "@/lib/google-auth";
import { errorResponse } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = requireRequestUser(request);
    return new Response(null, {
      status: 302,
      headers: {
        Location: beginGoogleOAuth(user.id, user.sessionId),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
