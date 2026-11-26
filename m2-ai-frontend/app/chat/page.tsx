"use client"; // state, effects, browser APIs (fetch stream, crypto) -> must run in the browser

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAxiosError } from "axios"; // type guard: true if err came from Axios (has .response)
import { api } from "@/lib/api"; // Axios instance (Bearer interceptor) — used for normal requests only
import { logout } from "@/lib/auth";
import {
  fetchHistory,
  MAX_MESSAGE_CHARS,
  streamChat,
  toFriendlyMessage,
  UnauthorizedError,
  type Message,
} from "@/lib/chat-api";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle"; // ADDED m2d20
import { ChatMessage } from "@/components/chat/chat-message";
import { ErrorCard } from "@/components/chat/error-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// Shape of GET /auth/me (UserPublic in main.py)
type Me = { id: number; email: string; created_at: string };

// ADDED m2d19: what the error card shows. Plain data, NO functions:
// a stored function would capture an old `messages` (stale closure); data is read fresh at click time.
type ChatErrorState = {
  title: string;
  message: string;
  retryText?: string; // text to resend. undefined = no Retry button
  replaceIds?: string[]; // bubbles of the failed attempt; Retry removes them before resending
};

// ADDED m2d19: within this many pixels of the bottom = "the user is following the conversation"
const STICK_THRESHOLD_PX = 80;

export default function ChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null); // null = still verifying the session
  const [error, setError] = useState<string | null>(null); // fatal: can't load the account
  const [chatError, setChatError] = useState<ChatErrorState | null>(null); // CHANGED: string -> object
  const [messages, setMessages] = useState<Message[]>([]); // ALL bubbles; per-item state lives INSIDE the objects
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true); // ADDED: true until /chat/history answers

  // useRef = a mutable box that survives re-renders WITHOUT causing one. Java anchor: an instance field.
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLElement | null>(null); // CHANGED: was bottomRef. Now points at the scrolling <section>
  const stickToBottomRef = useRef(true); // ADDED: ref, not state -> changing it must NOT re-render
  const textareaRef = useRef<HTMLTextAreaElement | null>(null); // ADDED: to give focus back after a reply

  // ADDED: derived value, recomputed every render. Never store something in state you can compute.
  const isBusy = isStreaming || isLoadingHistory;

  // CHANGED (m2d19): Door 2 (verify token) + load saved history, in that order
  useEffect(() => {
    // `cancelled` stops setState after the component unmounted
    // (React StrictMode runs effects twice in dev, so this matters).
    let cancelled = false;

    function leave() {
      logout(); // token is bad/expired -> delete the cookie
      router.replace("/login");
    }

    async function loadSession() {
      // Step 1 (CARRIED FORWARD m2d17): is the token actually valid, not just present?
      try {
        const { data } = await api.get<Me>("/auth/me");
        if (cancelled) return;
        setUser(data);
      } catch (err) {
        if (cancelled) return;
        if (isAxiosError(err) && err.response?.status === 401) return leave();
        setError("Could not reach the server. Is FastAPI running?");
        return; // no point loading history without a user
      }

      // Step 2 (ADDED m2d19): saved turns -> a refresh keeps the screen AND the model's context
      try {
        const saved = await fetchHistory();
        if (!cancelled) setMessages(saved);
      } catch (err) {
        if (cancelled) return;
        if (isAxiosError(err) && err.response?.status === 401) return leave();
        // Non-fatal: chatting still works, the old messages just aren't shown
        setChatError({ title: "History not loaded", message: `${toFriendlyMessage(err)} New messages still work.` });
      } finally {
        if (!cancelled) setIsLoadingHistory(false); // finally: runs on success AND error
      }
    }

    loadSession();
    return () => {
      cancelled = true; // cleanup function runs on unmount
    };
  }, [router]);

  // CARRIED FORWARD: cancel a running stream when the page unmounts. C++ anchor: destructor
  useEffect(() => {
    return () => abortRef.current?.abort(); // ?. = call only if not null
  }, []);

  // CHANGED m2d19: auto-scroll ONLY if the user is already near the bottom.
  // Runs after every chunk (messages changes) and when the error card appears/disappears (list height changes).
  useEffect(() => {
    const el = listRef.current;
    if (!el || !stickToBottomRef.current) return; // user scrolled up to read -> leave them alone
    el.scrollTop = el.scrollHeight; // instant jump: smooth scrolling on every chunk lags behind the text
  }, [messages, chatError]);

  // ADDED m2d19: a disabled textarea loses focus. Put the cursor back when we're idle again.
  useEffect(() => {
    if (!isBusy) textareaRef.current?.focus();
  }, [isBusy]);

  // ADDED m2d19: remember whether the user is following along or has scrolled up
  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    // scrollHeight = full content height, scrollTop = pixels scrolled from top, clientHeight = visible height
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < STICK_THRESHOLD_PX;
  }

  // CHANGED m2d19: the real send logic, shared by Send and Retry.
  // replaceIds = bubbles to remove first (Retry removes the failed attempt so it isn't in history twice).
  async function send(text: string, replaceIds: string[] = []) {
    if (!text || isBusy) return; // guard clause: ignore empty / double sends

    // History = what's on screen NOW (click-time snapshot), minus the attempt being retried,
    // stripped to { role, content } (backend forbids extra keys like `id`)
    const history = messages
      .filter((m) => !replaceIds.includes(m.id))
      .map(({ role, content }) => ({ role, content }));

    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID(); // remember this id: chunks get appended to this bubble
    const userMsg: Message = { id: userId, role: "user", content: text };
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "" };

    // ONE update: drop the failed attempt (if any) and add both new bubbles
    setMessages((prev) => [...prev.filter((m) => !replaceIds.includes(m.id)), userMsg, assistantMsg]);
    setChatError(null);
    setIsStreaming(true);
    stickToBottomRef.current = true; // you just sent: always show your message and the reply

    const controller = new AbortController();
    abortRef.current = controller;
    let received = false; // ADDED: did at least one chunk arrive? (plain local variable, only this call needs it)

    try {
      await streamChat({
        message: text,
        history,
        signal: controller.signal,
        onChunk: (chunk) => {
          received = true;
          // Runs hundreds of times. MUST use prev =>, never the frozen `messages` from this closure.
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m)),
          );
        },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User pressed Stop or left the page: not an error. Keep the partial text.
      } else if (err instanceof UnauthorizedError) {
        logout(); // token expired mid-session (30 min)
        router.replace("/login");
      } else {
        // Nothing arrived -> remove the empty AI bubble. Keep the user's bubble so they see WHAT failed.
        if (!received) setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        setChatError({
          title: received ? "Reply interrupted" : "Message not sent",
          message: toFriendlyMessage(err),
          retryText: text,
          replaceIds: [userId, assistantId],
        });
      }
    } finally {
      setIsStreaming(false); // runs on success, error AND abort
      abortRef.current = null;
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || isBusy) return;
    setInput("");
    void send(text); // void = "I'm intentionally not awaiting this promise"
  }

  // ADDED m2d19: reads chatError at CLICK time, so it always uses the current messages
  function handleRetry() {
    if (!chatError?.retryText) return;
    void send(chatError.retryText, chatError.replaceIds);
  }

  // Enter = send, Shift+Enter = newline.
  // isComposing = an IME (e.g. a Bangla keyboard) is still building a character -> don't send yet
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault(); // stop the textarea inserting a newline
      handleSend();
    }
  }

  // CARRIED FORWARD: early returns AFTER all hooks (hooks must run in the same order every render)
  if (error) return <p className="p-8 text-red-500">{error}</p>;
  if (!user) return <p className="p-8">Checking session…</p>;

  return (
    // h-dvh = full DYNAMIC viewport height: shrinks when the mobile URL bar / keyboard appears
    // (h-screen = 100vh does NOT shrink, so the input box ends up hidden under the keyboard).
    // flex-col: header (fixed size) / list (flex-1, scrolls) / form (fixed size) stacked vertically.
    <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col">
      {/* CHANGED m2d20: gap-3 + min-w-0 + truncate so a long email can't push the buttons off a 375px screen */}
      <header className="flex items-center justify-between gap-3 border-b border-foreground/10 px-3 py-3 sm:px-4">
        <div className="min-w-0">
          {/* min-w-0: flex children refuse to shrink below their text width by default; this allows it */}
          <h1 className="text-lg font-semibold sm:text-xl">Chat</h1>
          {/* truncate = one line + "…" when too long */}
          <p className="truncate text-xs text-muted-foreground">Signed in as {user.email}</p>
        </div>
        {/* shrink-0: the buttons keep their size, the email text gives way instead */}
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>

      {/* flex-1 + overflow-y-auto: takes the remaining height and scrolls on its own.
          aria-live: screen readers announce new text. aria-busy: "content is still changing" */}
      <section
        ref={listRef}
        onScroll={handleScroll}
        // CHANGED m2d20: tighter padding on phones (px-3 py-4), original spacing from sm (640px) up.
        // overscroll-contain: scrolling to the end of the list doesn't drag the whole page (mobile "bounce")
        className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4 sm:py-6"
        aria-live="polite"
        aria-busy={isBusy}
      >
        {isLoadingHistory && (
          <p className="text-center text-sm text-foreground/60">Loading conversation…</p>
        )}

        {!isLoadingHistory && messages.length === 0 && (
          <p className="text-center text-sm text-foreground/60">Send a message to start.</p>
        )}

        {messages.map((m, i) => (
          <ChatMessage
            key={m.id} // stable id, NOT the index i
            message={m}
            isStreaming={isStreaming && i === messages.length - 1 && m.role === "assistant"}
          />
        ))}
      </section>

      {/* CHANGED m2d19: red text line -> card with Retry / Dismiss */}
      {chatError && (
        <ErrorCard
          title={chatError.title}
          message={chatError.message}
          onRetry={chatError.retryText ? handleRetry : undefined}
          onDismiss={() => setChatError(null)}
        />
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault(); // no full-page form submit
          handleSend();
        }}
        // CHANGED m2d20: p-3 on phones, p-4 from sm up
        className="flex items-end gap-2 border-t border-foreground/10 p-3 sm:p-4"
      >
        <Textarea
          ref={textareaRef} // React 19: ref is a normal prop, Textarea spreads it onto <textarea>
          value={input}
          onChange={(e) => setInput(e.target.value)} // controlled input: React state is the source of truth
          onKeyDown={handleKeyDown}
          disabled={isBusy} // ADDED: no typing while a reply streams or history loads
          maxLength={MAX_MESSAGE_CHARS} // ADDED: browser blocks typing past the backend limit -> no 422
          // CHANGED m2d20: shorter placeholder. At 16px on a 375px phone the old hint wrapped and got cut off.
          // title = the Shift+Enter hint as a hover tooltip on desktop instead
          placeholder={isStreaming ? "Waiting for the reply…" : "Type a message…"}
          title="Enter to send, Shift+Enter for a new line"
          rows={1}
          // CHANGED m2d20: text-base (16px) on phones. iPhone Safari ZOOMS the page when you focus
          // an input with text smaller than 16px; sm:text-sm goes back to 14px on bigger screens.
          className="max-h-40 min-h-9 resize-none text-base sm:text-sm"
          aria-label="Message"
        />

        {isStreaming ? (
          // Outline look via className: components/ui/button.tsx has no `variant` prop
          <Button
            className="border border-foreground/20 bg-transparent text-foreground hover:bg-foreground/5"
            onClick={() => abortRef.current?.abort()}
          >
            Stop
          </Button>
        ) : (
          <Button type="submit" disabled={isBusy || !input.trim()}>
            Send
          </Button>
        )}
      </form>
    </main>
  );
}
