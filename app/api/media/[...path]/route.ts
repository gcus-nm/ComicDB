import { requireRequestUser } from "@/lib/auth";
import { readMedia } from "@/lib/images";
import { errorResponse } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    requireRequestUser(request);
    const { path } = await context.params;
    const bytes = await readMedia(path.join("/"));
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
