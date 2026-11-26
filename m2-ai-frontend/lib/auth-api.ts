// All the "talk to FastAPI about auth" code lives here, so pages stay about UI only.
import axios from "axios"; // imported only for axios.isAxiosError (type check helper)
import { api } from "@/lib/api"; // YOUR m2d15 instance (baseURL + Bearer interceptor). If it's a default export: `import api from "@/lib/api"`
import { setToken } from "@/lib/auth"; // YOUR m2d15 cookie helper. Rename if your function is called something else.
import type { LoginValues, RegisterValues } from "@/lib/schemas";
// `import type` = import only the TS type; it is erased at build time (zero runtime cost).

// Shape of what POST /auth/login returns (from your m2d13 backend).
// `type X = {...}` <-> a C++ struct with no methods; it only exists for the compiler.
type TokenResponse = {
  access_token: string;
  token_type: string; // "bearer"
};

// ---------- LOGIN ----------
// async function ... Promise<void> <-> Python `async def login(...) -> None`
export async function loginRequest(values: LoginValues): Promise<void> {
  const body = new URLSearchParams();
  body.append("username", values.email);
  body.append("password", values.password);

  const { data } = await api.post<TokenResponse>("/auth/login", body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  setToken(data.access_token);
}

// ---------- REGISTER (then auto-login) ----------
export async function registerRequest(values: RegisterValues): Promise<void> {
  // Send ONLY what the backend needs. confirmPassword stays in the browser.
  // Plain object -> Axios sends it as JSON (normal Pydantic body).
  await api.post("/auth/register", {
    email: values.email,
    password: values.password,
  });

  // Register doesn't give us a token (it just creates the user row),
  // so we log in right away with the same credentials. User never sees a second form.
  await loginRequest({ email: values.email, password: values.password });
}

// ---------- TURN ANY ERROR INTO ONE READABLE SENTENCE ----------
// `err: unknown` = TS's safest type: "could be anything, prove it before using it".
export function getErrorMessage(err: unknown): string {
  // isAxiosError<T>(err) is a TYPE GUARD: inside this if, TS knows err is an AxiosError
  // and that err.response.data looks like { detail?: unknown }.
  if (axios.isAxiosError<{ detail?: unknown }>(err)) {
    // No response at all = request never reached FastAPI (server down, wrong URL, CORS block).
    if (!err.response) {
      return "Can't reach the server. Is FastAPI running on port 8000?";
    }

    const detail = err.response.data?.detail; // ?. = "only read .detail if data isn't null/undefined"

    // HTTPException(detail="...") -> FastAPI sends a plain string.
    if (typeof detail === "string") return detail;

    // 422 validation error -> FastAPI sends a LIST: [{ loc: [...], msg: "Field required", ... }, ...]
    if (Array.isArray(detail)) {
      return detail
        .map((d: { msg?: string }) => d.msg ?? "Invalid input") // ?? = "use right side if left is null/undefined"
        .join(", ");
    }

    return `Request failed (${err.response.status})`; // template string <-> Python f"..."
  }

  return "Something went wrong. Try again.";
}
