import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider"; // ADDED m2d20
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// CHANGED: real title instead of "Create Next App" (shows in the browser tab and in m2d21 screenshots)
export const metadata: Metadata = {
  title: "AI Chat",
  description: "Streaming AI chat with FastAPI + Next.js",
};

// ADDED m2d20: Next.js turns this into <meta name="viewport" ...>
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // When the phone keyboard opens, SHRINK the page instead of sliding the keyboard over it.
  // Together with h-dvh on the chat page, this keeps the input box above the keyboard (Chrome Android).
  interactiveWidget: "resizes-content",
  // Mobile browser bar colour. Follows the OS setting (meta tags can't see our toggle), good enough
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // CARRIED FORWARD, now needed for TWO reasons: extensions edit <html>, AND next-themes
      // adds class="dark" to <html> before React loads -> server HTML and browser differ on purpose
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* ADDED m2d20
            attribute="class"       -> writes class="dark" on <html> (matches @custom-variant in globals.css)
            defaultTheme="system"   -> first visit follows the OS setting
            enableSystem            -> allow "system" as a theme
            disableTransitionOnChange -> no half-faded colours while switching */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
