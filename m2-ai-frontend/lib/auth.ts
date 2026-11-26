// lib/auth.ts — the ONLY place that knows how the token is stored.
// Day 16 (login page) and Day 17 (logout, route guard) import from here.
import Cookies from "js-cookie"; // default import: the library exports one object, like `import x` of a single module
import { TOKEN_COOKIE_NAME } from "./constants"; // shared with proxy.ts so both sides read the same cookie

const TOKEN_LIFETIME_MINUTES = 30; // must match ACCESS_TOKEN_EXPIRE_MINUTES in the backend's .env / main.py

// `export` = importable from other files (like `public` in Java).
// `: string | undefined` = return type is a string OR undefined (a union type, like Optional<String>).
export function getToken(): string | undefined {
  return Cookies.get(TOKEN_COOKIE_NAME); // read the cookie; undefined if it doesn't exist
}

// `: void` = returns nothing, same as void in C++/Java
export function setToken(token: string): void {
  Cookies.set(TOKEN_COOKIE_NAME, token, {
    // Date.now() = current time in milliseconds; add 30 minutes worth of ms.
    // The browser deletes the cookie at the same moment the JWT expires.
    expires: new Date(Date.now() + TOKEN_LIFETIME_MINUTES * 60 * 1000),
    sameSite: "strict", // browser won't send this cookie on requests started by other sites
    secure: window.location.protocol === "https:", // HTTPS-only in production, still works on http://localhost
  });
}

export function clearToken(): void {
  Cookies.remove(TOKEN_COOKIE_NAME); // delete the cookie = log out on the client side
}

export function logout(): void {
  // Cookies.remove(name) deletes the cookie; default path "/" matches how it was set.
  Cookies.remove(TOKEN_COOKIE_NAME);
}
