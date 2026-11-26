# m2-ai-frontend

Next.js 16 frontend for the AI chat app. It talks to the FastAPI backend in
[`../m2-ai-backend`](../m2-ai-backend). See the [root README](../README.md) for the full setup.

## Setup

```bash
cp .env.example .env.local   # Windows: copy .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000/register. The backend must be running on the URL set in
`NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:8000`).

## Pages

| Route | What |
|-------|------|
| `/register` | Create an account (react-hook-form + zod validation) |
| `/login` | Log in; the JWT is stored in the `token` cookie |
| `/chat` | Streaming chat with saved history, Stop, Retry, and a theme toggle |
| `/api-test` | Dev-only page for poking the API by hand |

`proxy.ts` (Next.js 16's replacement for `middleware.ts`) sends signed-out users from `/chat` to
`/login`, and signed-in users from `/login` and `/register` to `/chat`.

## Code map

| Path | What |
|------|------|
| `lib/api.ts` | Axios client that adds the `Authorization: Bearer` header |
| `lib/chat-api.ts` | `streamChat()`: reads the streamed reply with `fetch` + `ReadableStream` |
| `lib/auth.ts` | Token cookie helpers (`getToken`, `setToken`, `logout`) |
| `lib/schemas.ts` | zod schemas shared by the login and register forms |
| `components/chat/` | Message bubbles, Markdown rendering, error card |
| `components/ui/` | Small Tailwind UI primitives (button, card, input, textarea) |

## Scripts

- `npm run dev`: dev server on port 3000
- `npm run build`: production build
- `npm run start`: serve the production build
- `npm run lint`: ESLint
