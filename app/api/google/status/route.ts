import { requireRequestUser } from "@/lib/auth";
import {
  getGoogleIntegration,
  googlePublicConfiguration,
} from "@/lib/google-auth";
import { errorResponse } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = requireRequestUser(request);
    const integration = getGoogleIntegration(user.id);
    return Response.json(
      {
        ...googlePublicConfiguration(),
        connected: Boolean(integration),
        accountEmail: integration?.google_email ?? null,
        spreadsheet:
          integration?.spreadsheet_id &&
          integration.sheet_id !== null &&
          integration.sheet_title
            ? {
                id: integration.spreadsheet_id,
                name: integration.spreadsheet_name,
                sheetId: integration.sheet_id,
                sheetTitle: integration.sheet_title,
                url: `https://docs.google.com/spreadsheets/d/${integration.spreadsheet_id}/edit#gid=${integration.sheet_id}`,
              }
            : null,
        lastPushAt: integration?.last_push_at ?? null,
        lastPullAt: integration?.last_pull_at ?? null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
