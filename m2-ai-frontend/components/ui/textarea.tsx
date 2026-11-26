import * as React from "react";
import { cn } from "@/lib/utils";

// Same look as components/ui/input.tsx, but multi-line.
// React.ComponentProps<"textarea"> = every prop a normal <textarea> accepts (value, rows, onKeyDown, ...).
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full rounded-md border border-foreground/20 bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-foreground/40 focus-visible:border-foreground/50 focus-visible:ring-2 focus-visible:ring-foreground/15 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500 aria-invalid:ring-red-500/20",
        className,
      )}
      {...props}
    />
  );
}
