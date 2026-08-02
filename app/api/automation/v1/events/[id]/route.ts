import {
  getEvent,
  hasWishlistItemsOutsideEventRange,
  updateEvent,
} from "@/lib/catalog";
import {
  assertAutomationMutationRequest,
  idempotentAutomationMutation,
  requireAutomationUser,
} from "@/lib/automation";
import { errorResponse, HttpError } from "@/lib/security";
import { eventInputSchema } from "@/lib/validators";
import { z } from "zod";

const mutationSchema = z.object({
  dryRun: z.boolean().optional().default(false),
  input: eventInputSchema,
}).strict();

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireAutomationUser(request, "read");
    const { id } = await context.params;
    const event = getEvent(id);
    if (!event) throw new HttpError(404, "イベントが見つかりません。");
    return Response.json(event);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertAutomationMutationRequest(request);
    const identity = requireAutomationUser(request, "write");
    const { id } = await context.params;
    const body = mutationSchema.parse(await request.json());
    if (body.dryRun) {
      const current = getEvent(id);
      if (!current) throw new HttpError(404, "イベントが見つかりません。");
      if (hasWishlistItemsOutsideEventRange(id, body.input.startsOn, body.input.endsOn || null)) {
        throw new HttpError(409, "開催期間外になるほしいものがあります。");
      }
      return Response.json({
        ok: true,
        dryRun: true,
        summary: {
          action: "update",
          targetCount: 1,
          id,
          before: { name: current.name, startsOn: current.starts_on, endsOn: current.ends_on },
          after: { name: body.input.name, startsOn: body.input.startsOn, endsOn: body.input.endsOn || null },
        },
      });
    }
    return await idempotentAutomationMutation(request, identity, {
      scope: `event:${id}:update`,
      action: "event.update",
      target: id,
      input: body.input,
      execute: () => {
        if (hasWishlistItemsOutsideEventRange(id, body.input.startsOn, body.input.endsOn || null)) {
          throw new HttpError(409, "開催期間外になるほしいものがあります。");
        }
        const updated = updateEvent(id, body.input);
        if (!updated) throw new HttpError(404, "イベントが見つかりません。");
        return { body: updated };
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
