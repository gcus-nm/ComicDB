import { createEvent, listEvents } from "@/lib/catalog";
import {
  assertAutomationMutationRequest,
  idempotentAutomationMutation,
  requireAutomationUser,
} from "@/lib/automation";
import { errorResponse } from "@/lib/security";
import { eventInputSchema } from "@/lib/validators";
import { z } from "zod";

const mutationSchema = z.object({
  dryRun: z.boolean().optional().default(false),
  input: eventInputSchema,
}).strict();

export async function GET(request: Request) {
  try {
    requireAutomationUser(request, "read");
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
    return Response.json({ events: listEvents(Math.max(1, Math.min(500, limit))) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertAutomationMutationRequest(request);
    const identity = requireAutomationUser(request, "write");
    const body = mutationSchema.parse(await request.json());
    if (body.dryRun) {
      return Response.json({
        ok: true,
        dryRun: true,
        summary: { action: "create", targetCount: 1, name: body.input.name },
        input: body.input,
      });
    }
    return await idempotentAutomationMutation(request, identity, {
      scope: "event:create",
      action: "event.create",
      target: body.input.name,
      input: body.input,
      execute: () => ({ status: 201, body: createEvent(body.input) }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
