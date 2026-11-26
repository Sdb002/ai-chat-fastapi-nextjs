# m2-ai-backend

FastAPI backend for [m2-ai-frontend](../m2-ai-frontend) (Next.js). It gives the frontend
register / login / "who am I" with JWT tokens, and a Groq-powered chat (normal + streaming)
that saves every exchange. Users and conversations are stored in SQLite (`app.db`, created on first start).

`SECRET_KEY` and `GROQ_API_KEY` must be set in `.env`. The server refuses to start without them.

## Run everything (Windows, easiest)

Double-click **`start-all.cmd`**. It:

1. creates `.venv` and installs packages (first run only; later runs sync `requirements.txt`)
2. creates `.env` with a random `SECRET_KEY` (first run only), then stops if `GROQ_API_KEY` is empty
3. creates the frontend's `.env.local` from its `.env.example` and runs `npm install` (first run only)
4. opens two windows: backend on http://127.0.0.1:8000 and frontend on http://localhost:3000
5. opens http://localhost:3000/register in your browser

It expects the frontend folder at `..\m2-ai-frontend`, which is how this repo is laid out.

## Run the backend by hand

Windows (PowerShell):

```powershell
cd m2-ai-backend
python -m venv .venv                                     # first time only
.venv\Scripts\python -m pip install -r requirements.txt  # first time only
copy .env.example .env                                   # first time only, then set SECRET_KEY and GROQ_API_KEY
.venv\Scripts\python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

macOS / Linux:

```bash
cd m2-ai-backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then set SECRET_KEY and GROQ_API_KEY
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Interactive API docs: http://127.0.0.1:8000/docs

## Endpoints

| Method | Path             | Body                                   | Returns                                  |
|--------|------------------|----------------------------------------|------------------------------------------|
| GET    | `/`              | –                                      | `{"status": "ok"}` health check          |
| POST   | `/auth/register` | JSON `{email, password}` (8–128 chars) | `201` user · `400` "Email already registered" |
| POST   | `/auth/login`    | form `username` (= email), `password`  | `{access_token, token_type: "bearer"}` · `401` |
| GET    | `/auth/me`       | header `Authorization: Bearer <token>` | `{id, email, created_at}` · `401`        |
| POST   | `/chat`          | Bearer + JSON `{message, history?, mode?}` | `{reply, mode}` · `401` · `422` · `502` |
| POST   | `/chat/stream`   | Bearer + JSON `{message, history?, mode?}` | `text/plain` chunks as they are generated · `401` · `422` · `502` |
| GET    | `/chat/history`  | Bearer, query `limit` (1–200, default 50) | `[{id, mode, user_message, assistant_message, created_at}]`, oldest first |

`history` = `[{role: "user" | "assistant", content}]`, oldest first. `mode` = `default` · `tutor` · `concise`.
Unknown fields → `422` (`extra="forbid"`).

## Settings (`.env`)

| Name                          | Default                                       | Notes |
|-------------------------------|-----------------------------------------------|-------|
| `SECRET_KEY`                  | – (required)                                  | signs the JWTs; keep it secret |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30`                                          | must match `TOKEN_LIFETIME_MINUTES` in the frontend's `lib/auth.ts` |
| `DATABASE_URL`                | `sqlite:///./app.db`                          | delete `app.db` to wipe all users |
| `CORS_ORIGINS`                | `http://localhost:3000,http://127.0.0.1:3000` | where the frontend runs |
| `GROQ_API_KEY`                | – (required)                                  | from console.groq.com/keys |
| `GROQ_MODEL`                  | `openai/gpt-oss-120b`                         | any Groq chat model id |

`.env` and `app.db` are git-ignored. Never commit them: `.env` holds your keys and `app.db` holds user accounts.
