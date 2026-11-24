import { type NextRequest, NextResponse } from "next/server";

// Must match the names in src/server/auth.ts (kept inline: the proxy runs separately from the app code).
const SESSION_COOKIES = ["__Host-mlp_session", "mlp_session"];

/**
 * Optimistic check only: pages without a session cookie go to /login.
 * Every API route still validates the session against the database.
 */
export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.get(name)?.value);
  if (hasSession) return NextResponse.next();
  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/calendar/:path*", "/habits/:path*", "/dashboard/:path*", "/tasks/:path*", "/settings/:path*"],
};
