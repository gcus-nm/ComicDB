import { createBook, listBooks } from "@/lib/catalog";
import {
  assertAutomationMutationRequest,
  idempotentAutomationMutation,
  requireAutomationUser,
} from "@/lib/automation";
import { errorResponse } from "@/lib/security";
import { bookInputSchema } from "@/lib/validators";
import { z } from "zod";

export const dynamic = "force-dynamic";

const mutationSchema = z.object({
  dryRun: z.boolean().optional().default(false),
  input: bookInputSchema,
}).strict();

export async function GET(request: Request) {
  try {
    requireAutomationUser(request, "read");
    const url = new URL(request.url);
    return Response.json(listBooks({
      q: url.searchParams.get("q") ?? "",
      adultRating: url.searchParams.get("adultRating") ?? "",
      readStatus: url.searchParams.get("readStatus") ?? "",
      ownershipStatus: url.searchParams.get("ownershipStatus") ?? undefined,
      favorite: url.searchParams.get("favorite") === "true",
      eventId: url.searchParams.get("eventId") ?? "",
      storageId: url.searchParams.get("storageId") ?? "",
      tag: url.searchParams.get("tag") ?? "",
      page: Number(url.searchParams.get("page") ?? 1),
      limit: Number(url.searchParams.get("limit") ?? 100),
    }));
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
        summary: { action: "create", targetCount: 1, title: body.input.title },
        input: body.input,
      });
    }
    return await idempotentAutomationMutation(request, identity, {
      scope: "book:create",
      action: "book.create",
      target: body.input.title,
      input: body.input,
      execute: () => ({ status: 201, body: createBook(body.input) }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
