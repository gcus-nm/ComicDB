import { NextResponse } from "next/server";
import { login, sessionCookie } from "@/lib/auth";
import { assertMutationAllowed, errorResponse } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertMutationAllowed(request);
    const body = (await request.json()) as { username?: string; password?: string };
    const session = await login(body.username ?? "", body.password ?? "", request);
    const response = NextResponse.json({ user: session.user });
    response.cookies.set(sessionCookie(session.token, session.expiresAt));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
