// components/chat/markdown-content.tsx (NEW m2d20)
// Renders the AI's Markdown (**bold**, lists, `code`, tables) as real HTML elements.
import Markdown, { type Components } from "react-markdown"; // Markdown text -> React elements
import remarkGfm from "remark-gfm"; // plugin: GitHub extras (tables, ~~strike~~, task lists, auto-links)

// Map: Markdown element -> how WE draw it. Without this every tag gets browser defaults
// (Tailwind's reset removes list bullets, heading sizes, etc., so it would look like plain text).
// Defined OUTSIDE the component = created once, not on every render.
// Every colour uses foreground/background tokens -> dark mode works with zero extra classes.
const components: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>, // last:mb-0 = no gap after the final paragraph
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  h1: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h3>, // demote: # inside a bubble shouldn't be page-sized
  h2: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-2 mt-3 font-semibold first:mt-0">{children}</h4>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-foreground/20 pl-3 text-foreground/80 last:mb-0">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-foreground/10" />,
  a: ({ href, children }) => (
    // target="_blank" opens a new tab; rel="noopener noreferrer" stops that tab controlling ours (security)
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80">
      {children}
    </a>
  ),
  // Inline `code`. Block code is ALSO a <code>, but inside <pre>, so <pre> below resets these styles for it.
  code: ({ children }) => <code className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
  pre: ({ children }) => (
    // overflow-x-auto: long code lines scroll INSIDE the block instead of widening the bubble on a 375px phone.
    // [&>code]:... = "style my direct <code> child": removes the inline-code background/padding.
    <pre className="mb-3 overflow-x-auto rounded-lg bg-foreground/10 p-3 font-mono text-xs leading-relaxed last:mb-0 [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    // Tables are wide: wrap in a scroll box, same reason as <pre>
    <div className="mb-3 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-foreground/20 px-2 py-1 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-foreground/10 px-2 py-1">{children}</td>,
};

export function MarkdownContent({ text }: { text: string }) {
  // SECURITY: react-markdown does NOT render raw HTML by default.
  // If the model replies "<img src=x onerror=alert(1)>", it shows as text, never runs -> no XSS.
  // (Adding the rehype-raw plugin would turn that protection off. Don't, for model output.)
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={components}>
      {text}
    </Markdown>
  );
}
