// components/chat/chat-message.tsx
// One chat bubble. Pure presentational component: no state, no fetching.
import { memo } from "react"; // ADDED m2d20
import { cn } from "@/lib/utils"; // merges Tailwind classes; later ones win
import type { Message } from "@/lib/chat-api"; // `import type` = compile-time only, erased from the JS bundle
import { MarkdownContent } from "@/components/chat/markdown-content"; // ADDED m2d20

type ChatMessageProps = {
  message: Message;
  isStreaming?: boolean; // `?` = optional prop. True only for the AI bubble currently receiving chunks
};

// CHANGED m2d20: wrapped in memo().
// memo = "skip re-rendering if the props are the same as last time" (compared with ===).
// Why now: every streamed chunk re-renders the page. Before, each bubble just printed a string (cheap).
// Now each AI bubble PARSES Markdown (not cheap). With memo, only the streaming bubble re-parses:
// the other messages keep the same object reference because the chunk update does `m.id === id ? {...m} : m`.
export const ChatMessage = memo(function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
  const isUser = message.role === "user";
  // AI bubble exists but no token has arrived yet = the model is still working
  const isWaiting = isStreaming && !isUser && message.content === "";

  return (
    // Outer row: pushes the bubble right (user) or left (AI)
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          // CHANGED: 85% on phones (more room on 375px), 75% from sm (640px) up.
          // min-w-0 lets the inner code/table scroll boxes shrink instead of stretching the bubble.
          "min-w-0 max-w-[85%] break-words rounded-2xl px-4 py-2 text-sm leading-relaxed sm:max-w-[75%]",
          isUser
            ? "whitespace-pre-wrap rounded-br-sm bg-foreground text-background" // user: plain text, keep their \n
            : "rounded-bl-sm border border-foreground/10 bg-foreground/5 text-foreground", // AI: soft grey
          // CHANGED: whitespace-pre-wrap moved to the USER bubble only.
          // Markdown already turns blank lines into <p>; pre-wrap on top would double every gap.
        )}
      >
        {isWaiting ? (
          <TypingDots />
        ) : isUser ? (
          // User text is shown as typed: "**hi**" stays "**hi**" (they didn't mean formatting)
          message.content
        ) : (
          // <>...</> = Fragment: groups elements without adding a DOM node
          <>
            <MarkdownContent text={message.content} />
            {/* Blinking cursor while tokens arrive. After a Markdown block it sits on its own line, that's expected */}
            {isStreaming && (
              <span aria-hidden className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-current align-middle" />
            )}
          </>
        )}
      </div>
    </div>
  );
});

// Three bouncing dots ("typing indicator").
// Not exported = only usable inside this file. Java anchor: a private helper method.
function TypingDots() {
  return (
    // role="status" + aria-label: screen readers say "Assistant is typing" instead of nothing
    <span role="status" aria-label="Assistant is typing" className="flex h-5 items-center gap-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay} // the delays are unique, so they work as keys
          aria-hidden
          className="size-1.5 animate-bounce rounded-full bg-current opacity-60"
          style={{ animationDelay: `${delay}ms` }} // staggered start = the "wave" effect
        />
      ))}
    </span>
  );
}
