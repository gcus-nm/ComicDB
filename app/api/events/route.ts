import { requireRequestUser } from "@/lib/auth";
import { createEvent, listEvents } from "@/lib/catalog";
import { assertMutationAllowed, errorResponse } from "@/lib/security";
import { eventInputSchema } from "@/lib/validators";

export async function GET(request: Request) {
  try {
    requireRequestUser(request);
    return Response.json({ events: listEvents() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireRequestUser(request);
    assertMutationAllowed(request);
    const input = eventInputSchema.parse(await request.json());
    return Response.json(createEvent(input), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
