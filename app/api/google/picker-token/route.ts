import { requireRequestUser } from "@/lib/auth";
import {
  googlePublicConfiguration,
  pickerAccessToken,
} from "@/lib/google-auth";
import { errorResponse } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = requireRequestUser(request);
    const configuration = googlePublicConfiguration();
    return Response.json(
      {
        accessToken: await pickerAccessToken(user.id),
        pickerApiKey: configuration.pickerApiKey,
        projectNumber: configuration.projectNumber,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
