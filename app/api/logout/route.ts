import { NextResponse } from "next/server";
import { revokeSession, SESSION_COOKIE } from "@/lib/auth";
import { assertMutationAllowed, errorResponse } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertMutationAllowed(request);
    const cookie = request.headers.get("cookie") ?? "";
    const token = cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1);
    revokeSession(token ? decodeURIComponent(token) : undefined);
    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: "",
      path: "/",
      expires: new Date(0),
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
