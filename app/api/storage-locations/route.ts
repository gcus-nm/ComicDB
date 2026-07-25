import { requireRequestUser } from "@/lib/auth";
import { listStorageLocations } from "@/lib/catalog";
import { errorResponse } from "@/lib/security";

export async function GET(request: Request) {
  try {
    requireRequestUser(request);
    return Response.json({ locations: listStorageLocations() });
  } catch (error) {
    return errorResponse(error);
  }
}
