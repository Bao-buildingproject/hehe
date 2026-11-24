import "server-only";
import { unstable_rethrow } from "next/navigation";
import { type NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { firstIssue } from "@/lib/validation";
import {
  type SessionUser,
  SESSION_COOKIE_NAMES,
  clearedSessionCookie,
  sessionCookie,
  validateSessionToken,
} from "./auth";
import { type Db, getDb } from "./db";
import { AppError, badRequest, forbidden, unauthorized } from "./errors";
import { logEvent } from "./log";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function errorResponse(error: AppError): NextResponse {
  return NextResponse.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers: { "Cache-Control": "no-store", ...(error.headers ?? {}) } },
  );
}

function handleError(error: unknown, req: NextRequest): NextResponse {
  // Let Next.js handle its own control-flow signals (e.g. "bail out of prerendering").
  unstable_rethrow(error);
  if (error instanceof AppError) return errorResponse(error);
  logEvent("error", "unhandled_error", {
    path: req.nextUrl.pathname,
    method: req.method,
    message: error instanceof Error ? error.message : String(error),
  });
  return errorResponse(new AppError(500, "Đã có lỗi phía máy chủ. Vui lòng thử lại.", "server_error"));
}

/** Blocks cross-site requests (CSRF): mutating calls must come from this site. */
export function assertSameOrigin(req: NextRequest): void {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw forbidden();
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw forbidden();
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden();
  }
  if (originHost !== host) throw forbidden();
}

export async function readJson<S extends z.ZodType>(req: NextRequest, schema: S, maxBytes = 256 * 1024): Promise<z.output<S>> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) throw badRequest("Yêu cầu phải ở dạng JSON");
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new AppError(413, "Dữ liệu gửi lên quá lớn", "payload_too_large");
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw badRequest("JSON không hợp lệ");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw badRequest(firstIssue(parsed.error));
  return parsed.data;
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function readSessionToken(req: NextRequest): string | null {
  for (const name of SESSION_COOKIE_NAMES) {
    const value = req.cookies.get(name)?.value;
    if (value) return value;
  }
  return null;
}

export interface AuthedContext<P> {
  req: NextRequest;
  db: Db;
  user: SessionUser;
  token: string;
  params: P;
}

type RouteCtx<P> = { params: Promise<P> };

function toNextResponse(res: Response): NextResponse {
  return res instanceof NextResponse ? res : new NextResponse(res.body, res);
}

/** Route handler that requires a valid session; errors become JSON responses. */
export function authed<P = Record<string, never>>(handler: (ctx: AuthedContext<P>) => Promise<Response>) {
  return async (req: NextRequest, routeCtx: RouteCtx<P>): Promise<Response> => {
    try {
      if (MUTATING.has(req.method)) assertSameOrigin(req);
      const db = getDb();
      const token = readSessionToken(req);
      const session = await validateSessionToken(db, token);
      if (!session || !token) {
        const res = errorResponse(unauthorized());
        if (token) res.cookies.set(clearedSessionCookie());
        return res;
      }
      const params = (routeCtx?.params ? await routeCtx.params : {}) as P;
      const res = toNextResponse(await handler({ req, db, user: session.user, token, params }));
      if (session.renewedUntil) res.cookies.set(sessionCookie(token, session.renewedUntil));
      return res;
    } catch (error) {
      return handleError(error, req);
    }
  };
}

/** Route handler without a session (login, signup, cron). */
export function open<P = Record<string, never>>(
  handler: (ctx: { req: NextRequest; db: Db; params: P }) => Promise<Response>,
  options: { sameOrigin?: boolean } = { sameOrigin: true },
) {
  return async (req: NextRequest, routeCtx: RouteCtx<P>): Promise<Response> => {
    try {
      if (options.sameOrigin !== false && MUTATING.has(req.method)) assertSameOrigin(req);
      const params = (routeCtx?.params ? await routeCtx.params : {}) as P;
      return await handler({ req, db: getDb(), params });
    } catch (error) {
      return handleError(error, req);
    }
  };
}
