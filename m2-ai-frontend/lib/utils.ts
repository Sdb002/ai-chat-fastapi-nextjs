import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// cn() = merge Tailwind classes, later ones win (shadcn's standard helper).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
