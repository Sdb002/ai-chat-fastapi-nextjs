// app/api-test/page.tsx — throwaway page to prove the wiring. Delete after Day 16.
"use client"; // uses useState and cookies, so it must run in the browser (m1d23)

import { useState } from "react";
import { isAxiosError } from "axios"; // type guard: true only if the error came from Axios
import { api } from "@/lib/api";
import { clearToken, setToken } from "@/lib/auth";

export default function ApiTestPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [output, setOutput] = useState("Nothing yet.");

  // One helper so every button reports success and failure the same way.
  // `action: () => Promise<unknown>` = a function that takes nothing and returns
  // a Promise (a future result, like Python's awaitable / Java's CompletableFuture).
  // `unknown` = "some type, check before using it" (safer than `any`).
  async function run(label: string, action: () => Promise<unknown>) {
    try {
      const data = await action(); // await = pause here until the request finishes
      // JSON.stringify(x, null, 2) = pretty-print as JSON with 2-space indent
      setOutput(`${label} OK\n${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      if (isAxiosError(error)) {
        // error.response is undefined when NO response arrived at all
        // (backend down, or CORS blocked it).
        // `?.` = optional chaining: only read .status if response exists.
        // `??` = nullish coalescing: use the right side if the left is null/undefined.
        const status = error.response?.status ?? "no response (backend down or CORS)";
        setOutput(
          `${label} FAILED: ${status}\n${JSON.stringify(error.response?.data, null, 2)}`,
        );
      } else {
        setOutput(`${label} FAILED: ${String(error)}`); // String(x) = convert anything to text
      }
    }
  }

  const checkBackend = () =>
    run("GET /", async () => (await api.get("/")).data); // .data = the parsed JSON body

  const login = () =>
    run("POST /auth/login", async () => {
      // URLSearchParams builds form data: username=...&password=...
      // /auth/login takes an OAuth2 FORM, not JSON (m2d13). Axios sees this type
      // and sets Content-Type: application/x-www-form-urlencoded by itself.
      // `{ username: email, password }` — `password` alone is shorthand for `password: password`.
      const form = new URLSearchParams({ username: email, password });
      const { data } = await api.post("/auth/login", form); // { data } = destructuring: pull .data out of the response
      setToken(data.access_token);
      return { token_type: data.token_type, stored: true }; // never print the token itself on screen
    });

  const whoAmI = () =>
    run("GET /auth/me", async () => (await api.get("/auth/me")).data);

  const logout = () => {
    clearToken();
    setOutput("Token cleared.");
  };

  return (
    <main className="mx-auto max-w-xl space-y-4 p-8">
      <h1 className="text-xl font-semibold">API wiring test</h1>

      <div className="space-y-2">
        {/* Controlled inputs (m1d12): React state is the single source of truth */}
        <input
          className="w-full rounded border p-2"
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full rounded border p-2"
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="rounded border px-3 py-1" onClick={checkBackend}>Check backend</button>
        <button className="rounded border px-3 py-1" onClick={login}>Login</button>
        <button className="rounded border px-3 py-1" onClick={whoAmI}>Who am I</button>
        <button className="rounded border px-3 py-1" onClick={logout}>Logout</button>
      </div>

      {/* <pre> keeps line breaks and spacing, so the JSON stays readable */}
      <pre className="overflow-x-auto rounded border p-3 text-sm">{output}</pre>
    </main>
  );
}
