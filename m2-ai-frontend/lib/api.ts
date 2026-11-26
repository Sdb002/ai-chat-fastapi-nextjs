// lib/api.ts — one configured Axios client for the whole app.
import axios from "axios";
import { getToken } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL; // NEXT_PUBLIC_ prefix = exposed to browser code

if (!API_URL) {
  throw new Error(
    "NEXT_PUBLIC_API_URL is not set. Add it to .env.local and restart `npm run dev`.",
  );
}

// axios.create({...}) = build a client with preset options (like a configured
// requests.Session() in Python). `export const` = shared, never reassigned.
export const api = axios.create({
  baseURL: API_URL, // api.get("/auth/me") -> http://127.0.0.1:8000/auth/me
  timeout: 30_000, // milliseconds; `_` is just a digit separator (30_000 == 30000). LLM calls are slow.
});

// interceptors.request.use(fn) -> run fn on EVERY request before it is sent.
// (config) => {...} is an arrow function = a lambda, like `lambda config: ...` in Python.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    // Template literal: `Bearer ${token}` is the same as "Bearer " + token
    config.headers.Authorization = `Bearer ${token}`;
  }
  // No token -> send no header at all, and let FastAPI answer 401.
   return config; // MUST return config, or the request never goes out
});
