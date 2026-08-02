import { appOrigin } from "./env";
import { ZodError } from "zod";

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
  const headers = { "Cache-Control": "private, no-store" };
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: "入力が不正です。",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400, headers },
    );
  }
  if (error instanceof HttpError) {
    return Response.json(
      { error: error.message },
      { status: error.status, headers },
    );
  }
  const message = error instanceof Error ? error.message : "処理に失敗しました。";
  if (/invalid_grant/iu.test(message)) {
    return Response.json(
      { error: "Googleの認可が失効しています。接続し直してください。" },
      { status: 401, headers },
    );
  }
  console.error(
    error instanceof Error ? error.stack ?? `${error.name}: ${error.message}` : message,
  );
  return Response.json({ error: message }, { status: 500, headers });
}
