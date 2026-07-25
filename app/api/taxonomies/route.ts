import { requireRequestUser } from "@/lib/auth";
import {
  createTaxonomyTag,
  deleteTaxonomyTag,
  listTaxonomyTags,
  updateTaxonomyTagParent,
} from "@/lib/catalog";
import { assertMutationAllowed, errorResponse, HttpError } from "@/lib/security";

export async function GET(request: Request) {
  try {
    requireRequestUser(request);
    return Response.json({ tags: listTaxonomyTags() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireRequestUser(request);
    assertMutationAllowed(request);
    const body = (await request.json()) as {
      name?: string;
      type?: string;
      parentId?: string | null;
    };
    try {
      return Response.json(
        createTaxonomyTag(body.name ?? "", body.type ?? "", body.parentId ?? null),
        { status: 201 },
      );
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "追加に失敗しました。");
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    requireRequestUser(request);
    assertMutationAllowed(request);
    const body = (await request.json()) as { id?: string; parentId?: string };
    try {
      return Response.json(
        updateTaxonomyTagParent(body.id ?? "", body.parentId ?? ""),
      );
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "更新に失敗しました。");
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    requireRequestUser(request);
    assertMutationAllowed(request);
    const id = new URL(request.url).searchParams.get("id") ?? "";
    try {
      deleteTaxonomyTag(id);
    } catch (error) {
      throw new HttpError(409, error instanceof Error ? error.message : "削除に失敗しました。");
    }
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
