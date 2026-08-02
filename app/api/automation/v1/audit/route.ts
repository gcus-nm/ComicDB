import { listAutomationAudit, requireAutomationUser } from "@/lib/automation";
import { errorResponse } from "@/lib/security";

export async function GET(request: Request) {
  try {
    requireAutomationUser(request, "read");
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
    return Response.json({ audit: listAutomationAudit(limit) });
  } catch (error) {
    return errorResponse(error);
  }
}
