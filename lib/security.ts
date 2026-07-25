import { appOrigin } from "./env";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function assertMutationAllowed(request: Request) {
  const origin = request.headers.get("origin");
  const expected = appOrigin().origin;
  if (origin && origin !== expected) {
    throw new HttpError(403, "許可されていない送信元です。");
  }
  if (!origin && request.headers.get("x-comicdb-request") !== "1") {
    throw new HttpError(403, "リクエストの送信元を確認できません。");
  }
}

export function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (process.env.TRUSTED_PROXY_CIDRS && forwarded) {
    return forwarded.split(",")[0]?.trim() || "proxy";
  }
  return request.headers.get("x-real-ip") ?? "local";
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "処理に失敗しました。";
  console.error(error);
  return Response.json({ error: message }, { status: 500 });
}
