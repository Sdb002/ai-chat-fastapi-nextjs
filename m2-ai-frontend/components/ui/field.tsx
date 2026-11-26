import * as React from "react";
import { cn } from "@/lib/utils";

export function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field-group" className={cn("group/field-group flex w-full flex-col gap-6", className)} {...props} />;
}

// Pass data-invalid={true} to turn the label/description red.
// CHANGED m2d20: text-red-600 -> text-destructive (theme token from globals.css, readable in dark mode)
export function Field({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="field"
      className={cn("group/field flex w-full flex-col gap-2 data-[invalid=true]:text-destructive", className)}
      {...props}
    />
  );
}

export function FieldLabel({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="field-label"
      className={cn("text-sm font-medium leading-snug select-none", className)}
      {...props}
    />
  );
}

export function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="field-description" className={cn("text-sm text-foreground/60", className)} {...props} />;
}

type FieldErrorProps = React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>;
};

// Shows children, or the unique messages from `errors` (react-hook-form / Zod errors).
export function FieldError({ className, children, errors, ...props }: FieldErrorProps) {
  let content: React.ReactNode = children;

  if (!content && errors?.length) {
    const messages = [...new Set(errors.map((e) => e?.message).filter(Boolean))] as string[];
    content =
      messages.length === 1 ? (
        messages[0]
      ) : messages.length > 1 ? (
        <ul className="ml-4 list-disc">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null;
  }

  if (!content) return null;

  return (
    <div role="alert" data-slot="field-error" className={cn("text-sm font-normal text-destructive", className)} {...props}>
      {content}
    </div>
  );
}
