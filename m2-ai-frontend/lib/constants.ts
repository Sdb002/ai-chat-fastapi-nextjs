// One source of truth for the cookie name.
// proxy.ts (server side) and lib/auth.ts (browser side) must agree, or the guard silently never fires.
// `as const` makes TypeScript treat this as the literal type "token", not a general string.
export const TOKEN_COOKIE_NAME = "token" as const;
