import { NextResponse } from "next/server";
import { createAdmin, sessionCookie, userExists } from "@/lib/auth";
import { assertMutationAllowed, errorResponse } from "@/lib/security";

export async function GET() {
  return Response.json({ required: !userExists() });
}

export async function POST(request: Request) {
  try {
    assertMutationAllowed(request);
    const body = (await request.json()) as { username?: string; password?: string };
    const session = await createAdmin(body.username ?? "", body.password ?? "");
    const response = NextResponse.json({ user: session.user }, { status: 201 });
    response.cookies.set(sessionCookie(session.token, session.expiresAt));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
