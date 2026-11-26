// NextRequest = incoming request object; NextResponse = helper to build redirects / pass-through.
import { NextResponse, type NextRequest } from "next/server";
import { TOKEN_COOKIE_NAME } from "./lib/constants";

// Next.js 16 looks for an exported function named `proxy` (it was `middleware` before).
export function proxy(request: NextRequest) {
  // request.nextUrl.pathname = the path part only, e.g. "/chat"
  const { pathname } = request.nextUrl;

  // request.cookies.get(name) returns { name, value } or undefined.
  // `?.value` safely reads value; Boolean(...) turns it into true/false.
  // An empty-string cookie counts as "no token".
  const hasToken = Boolean(request.cookies.get(TOKEN_COOKIE_NAME)?.value);

  const isAuthPage = pathname === "/login" || pathname === "/register";

  // Door 1: no ticket -> go to login.
  // new URL("/login", request.url) builds an ABSOLUTE url; redirect() requires absolute URLs.
  if (!hasToken && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Reverse guard: already logged in -> no reason to see login/register.
  if (hasToken && isAuthPage) {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  // NextResponse.next() = "all good, continue to the page".
  return NextResponse.next();
}

// Only run the proxy on these paths. Everything else (images, /_next, etc.) skips it.
export const config = {
  matcher: ["/chat/:path*", "/login", "/register"],
};
