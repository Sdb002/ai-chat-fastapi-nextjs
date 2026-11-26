// lib/chat-api.ts — everything the chat page needs from the backend.
//   streamChat()        POST /chat/stream   native fetch + ReadableStream (m2d18)
//   fetchHistory()      GET  /chat/history  Axios `api` instance          (m2d19)
//   toFriendlyMessage() any thrown error -> one sentence for the error card (m2d19)
// Streaming uses native fetch, NOT Axios: Axios in the browser is built on XMLHttpRequest
// and can't hand you the body piece by piece. fetch gives response.body as a ReadableStream.
import { isAxiosError } from "axios";
import { api } from "@/lib/api"; // normal JSON requests: the interceptor adds the Bearer header for us
import { getToken } from "@/lib/auth"; // same cookie reader the Axios interceptor uses

const API_URL = process.env.NEXT_PUBLIC_API_URL; // hard-fail, same rule as lib/api.ts
if (!API_URL) {
  throw new Error("NEXT_PUBLIC_API_URL is not set. Add it to .env.local and restart `npm run dev`.");
}

// ---------- Limits (must match main.py) ----------
export const MAX_MESSAGE_CHARS = 4_000; // ChatRequest.message max_length in main.py. Longer -> 422
export const HISTORY_LOAD_LIMIT = 50; // rows from /chat/history. 1 row = 1 user + 1 AI message

// ---------- Types ----------
export type ChatRole = "user" | "assistant"; // union type: must be exactly one of these strings
export type ChatMode = "default" | "tutor" | "concise"; // must match ChatMode in main.py

export type Message = {
  id: string; // stable React key + lets us find the AI bubble to append chunks to
  role: ChatRole;
  content: string;
};

// What main.py's HistoryMessage accepts (extra="forbid": no `id`, or FastAPI answers 422)
export type HistoryItem = { role: ChatRole; content: string };

// One row of GET /chat/history (ConversationPublic in main.py)
type ConversationRow = {
  id: number;
  mode: string;
  user_message: string;
  assistant_message: string;
  created_at: string; // datetimes arrive as ISO strings in JSON, not Date objects
};

// ---------- Errors ----------
// Custom error so the page can tell "session expired" apart from other failures.
// Java anchor: class UnauthorizedException extends RuntimeException {}
export class UnauthorizedError extends Error {
  constructor(message = "Session expired") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

// ADDED m2d19: any non-2xx that isn't 401. Keeps the status code so the UI can pick the right sentence.
export class ChatApiError extends Error {
  readonly status: number; // readonly = can't be reassigned after the constructor. Java: final int status;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ChatApiError";
    this.status = status;
  }
}

// ---------- History (ADDED m2d19) ----------
// The backend stores 1 row per turn; the UI needs 2 bubbles per turn.
export async function fetchHistory(limit = HISTORY_LOAD_LIMIT): Promise<Message[]> {
  // params -> Axios builds the query string for you: /chat/history?limit=50
  const { data } = await api.get<ConversationRow[]>("/chat/history", { params: { limit } });

  // flatMap = map each row to an ARRAY, then flatten one level: [[u1, a1], [u2, a2]] -> [u1, a1, u2, a2]
  // Python anchor: [m for row in rows for m in (user_msg(row), ai_msg(row))]
  // `(row): Message[] =>` annotates the return type so "user"/"assistant" stay ChatRole, not plain string
  return data.flatMap((row): Message[] => [
    { id: `db-${row.id}-user`, role: "user", content: row.user_message }, // id built from the DB id = stable key
    { id: `db-${row.id}-assistant`, role: "assistant", content: row.assistant_message },
  ]);
}

// ---------- Error -> friendly sentence (ADDED m2d19) ----------
// `unknown` = "could be anything": TS forces us to narrow it (instanceof) before touching fields.
export function toFriendlyMessage(err: unknown): string {
  const unreachable = "Can't reach the server. Check that FastAPI is running on port 8000.";

  // fetch() rejects with TypeError when NO HTTP response came back at all:
  // server down, wrong port, CORS block, Wi-Fi off. Chrome's text: "Failed to fetch".
  if (err instanceof TypeError) return unreachable;

  if (err instanceof ChatApiError) {
    if (err.status === 502) return "The AI service didn't respond. Try again in a moment.";
    if (err.status === 422) {
      return `The server rejected that message. Keep it under ${MAX_MESSAGE_CHARS.toLocaleString("en-US")} characters.`;
    }
    if (err.status >= 500) return "The server hit an error. Try again.";
    return `Request failed (status ${err.status}).`;
  }

  // Axios (fetchHistory): no .response = network failure, same meaning as the TypeError branch
  if (isAxiosError(err)) {
    return err.response ? `Request failed (status ${err.response.status}).` : unreachable;
  }

  return "Something went wrong. Try again.";
}

// ---------- The streaming call (m2d18) ----------
type StreamChatOptions = {
  message: string;
  history: HistoryItem[];
  mode?: ChatMode; // omitted -> backend default ("default")
  signal?: AbortSignal; // abort() on its controller cancels the request AND the stream
  onChunk: (text: string) => void; // callback: called once per decoded piece of text
};

export async function streamChat({ message, history, mode, signal, onChunk }: StreamChatOptions): Promise<void> {
  const token = getToken(); // undefined if the cookie is gone

  const response = await fetch(`${API_URL}/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // No interceptor here: fetch knows nothing about lib/api.ts, so we attach the token ourselves.
      // Conditional spread: adds the header only if a token exists.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, history, ...(mode ? { mode } : {}) }),
    signal,
  });

  // fetch does NOT throw on 4xx/5xx: it resolves normally. These checks are mandatory.
  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    // ok = status 200–299
    const detail = await response.text(); // error bodies are small JSON, read them whole
    throw new ChatApiError(response.status, `Chat failed (${response.status}): ${detail}`); // CHANGED: keeps status
  }
  if (!response.body) {
    // body can be null (e.g. 204). TS forces this check.
    throw new Error("Response has no body to stream");
  }

  const reader = response.body.getReader(); // locks the stream: only this reader can read it
  const decoder = new TextDecoder("utf-8"); // bytes (Uint8Array) -> string

  try {
    while (true) {
      const { done, value } = await reader.read(); // waits for the next chunk. Java: in.read(buf)
      if (done) break; // server closed the stream. Java: read() == -1

      // stream: true -> keep an incomplete multi-byte char (Bangla = 3 bytes) for the next call
      const text = decoder.decode(value, { stream: true });
      if (text) onChunk(text); // can be "" if the chunk held only part of one character
    }

    const tail = decoder.decode(); // no args = flush any bytes still held
    if (tail) onChunk(tail);
  } finally {
    reader.releaseLock(); // always unlock, even on abort/error. C++ anchor: RAII cleanup
  }
}
