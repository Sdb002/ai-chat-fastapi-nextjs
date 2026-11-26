"use client"; // next-themes uses React context + localStorage -> browser only

// NEW m2d20
// Thin wrapper so the Server Component layout.tsx can render a Client Component provider.
// layout.tsx stays a Server Component (no "use client" there) -> its metadata/fonts keep working.
import { ThemeProvider as NextThemesProvider } from "next-themes";

// React.ComponentProps<typeof X> = "whatever props X accepts". Java anchor: forwarding a constructor's parameters.
export function ThemeProvider(props: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props} />;
}
