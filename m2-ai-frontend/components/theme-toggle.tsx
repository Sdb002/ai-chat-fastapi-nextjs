"use client"; // click handler + useTheme hook -> browser only

// NEW m2d20: sun/moon button that flips light <-> dark.
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  // resolvedTheme = the theme actually showing: "light" | "dark".
  // (theme can be "system"; resolvedTheme already turned "system" into light or dark.)
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      // Same outline look as LogoutButton. size-9 + px-0 = square icon button
      className="size-9 border border-foreground/20 bg-transparent px-0 text-foreground hover:bg-foreground/5"
      // resolvedTheme is read at CLICK time, in the browser -> always the real current value
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      // Fixed label on purpose: on the server the theme is unknown, so a label like
      // "Switch to dark" could differ between server HTML and browser -> hydration warning
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
    >
      {/* BOTH icons are always rendered; CSS picks one.
          `dark:hidden` hides the moon when <html class="dark">, `hidden dark:block` shows the sun.
          No JS decides -> nothing can mismatch between server and browser. */}
      <MoonIcon className="size-4 dark:hidden" />
      <SunIcon className="hidden size-4 dark:block" />
    </Button>
  );
}

// Small inline SVG icons (no icon library installed in this project).
// stroke="currentColor" = icon uses the button's text colour, so it themes automatically.
function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
