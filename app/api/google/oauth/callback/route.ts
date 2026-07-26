import { requireRequestUser } from "@/lib/auth";
import { appOrigin } from "@/lib/env";
import { completeGoogleOAuth } from "@/lib/google-auth";
import { errorResponse, HttpError } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = requireRequestUser(request);
    const url = new URL(request.url);
    const oauthError = url.searchParams.get("error");
    if (oauthError) {
      throw new HttpError(400, `Google認可が完了しませんでした: ${oauthError}`);
    }
    await completeGoogleOAuth(
      url.searchParams.get("code") ?? "",
      url.searchParams.get("state") ?? "",
      user.id,
      user.sessionId,
    );
    return new Response(null, {
      status: 303,
      headers: {
        Location: new URL(
          "/settings?google=connected#google-sheets",
          appOrigin(),
        ).toString(),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
