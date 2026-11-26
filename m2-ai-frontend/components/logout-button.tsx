"use client"; // uses a hook (useRouter) and a click handler -> must run in the browser

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button"; // this project's minimal Button (no `variant` prop)
import { logout } from "@/lib/auth";

export function LogoutButton() {
  const router = useRouter(); // gives programmatic navigation

  function handleLogout() {
    logout(); // 1) delete the cookie first
    router.replace("/login"); // 2) replace (not push): Back must not return to /chat
    router.refresh(); // 3) drop cached server data so no stale protected page lingers
  }

  return (
    // Outline look via className, because components/ui/button.tsx has no `variant` prop.
    <Button
      className="border border-foreground/20 bg-transparent text-foreground hover:bg-foreground/5"
      onClick={handleLogout}
    >
      Log out
    </Button>
  );
}
