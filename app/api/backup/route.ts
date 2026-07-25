import { requireRequestUser } from "@/lib/auth";
import { backupStatus, createBackup } from "@/lib/backup";
import { assertMutationAllowed, errorResponse } from "@/lib/security";

export async function GET(request: Request) {
  try {
    requireRequestUser(request);
    return Response.json(await backupStatus());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireRequestUser(request);
    assertMutationAllowed(request);
    return Response.json(await createBackup("manual"), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
