import { deleteBook, getBook, updateBook } from "@/lib/catalog";
import {
  assertAutomationMutationRequest,
  idempotentAutomationMutation,
  requireAutomationUser,
} from "@/lib/automation";
import { removeStoredMedia } from "@/lib/images";
import { errorResponse, HttpError } from "@/lib/security";
import { bookInputSchema } from "@/lib/validators";
import { z } from "zod";

const mutationSchema = z.object({
  dryRun: z.boolean().optional().default(false),
  input: bookInputSchema,
}).strict();
const deleteSchema = z.object({
  dryRun: z.boolean().optional().default(false),
  confirmation: z.string(),
}).strict();

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireAutomationUser(request, "read");
    const { id } = await context.params;
    const book = getBook(id);
    if (!book) throw new HttpError(404, "蔵書が見つかりません。");
    return Response.json(book);
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
      const current = getBook(id);
      if (!current) throw new HttpError(404, "蔵書が見つかりません。");
      return Response.json({
        ok: true,
        dryRun: true,
        summary: {
          action: "update",
          targetCount: 1,
          id,
          before: { title: current.title, updatedAt: current.updatedAt },
          after: { title: body.input.title },
        },
      });
    }
    return await idempotentAutomationMutation(request, identity, {
      scope: `book:${id}:update`,
      action: "book.update",
      target: id,
      input: body.input,
      execute: () => {
        const updated = updateBook(id, body.input);
        if (!updated) throw new HttpError(404, "蔵書が見つかりません。");
        return { body: updated };
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertAutomationMutationRequest(request);
    const identity = requireAutomationUser(request, "write");
    const { id } = await context.params;
    const body = deleteSchema.parse(await request.json());
    if (body.confirmation !== id) {
      throw new HttpError(400, "削除対象IDをconfirmationへ指定してください。");
    }
    if (body.dryRun) {
      const current = getBook(id);
      if (!current) throw new HttpError(404, "蔵書が見つかりません。");
      return Response.json({
        ok: true,
        dryRun: true,
        summary: { action: "delete", targetCount: 1, id, title: current.title },
      });
    }
    return await idempotentAutomationMutation(request, identity, {
      scope: `book:${id}:delete`,
      action: "book.delete",
      target: id,
      input: body,
      execute: async () => {
        const mediaPaths = deleteBook(id);
        if (!mediaPaths) throw new HttpError(404, "蔵書が見つかりません。");
        await removeStoredMedia(mediaPaths);
        return { body: { deleted: true, id } };
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
