"use client";
// ^ Must be line 1. Marks this as a Client Component: it runs in the browser,
//   so it can use state, click handlers, and cookies. (Server Components can't.)

import Link from "next/link"; // <Link> = client-side navigation (no full page reload)
import { useRouter } from "next/navigation"; // App Router's router (NOT "next/router", that's the old Pages Router)
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod"; // the adapter: lets react-hook-form run Zod rules

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { loginSchema, type LoginValues } from "@/lib/schemas";
import { getErrorMessage, loginRequest } from "@/lib/auth-api";

export default function LoginPage() {
  const router = useRouter();

  // useForm() creates the form's "brain": values, errors, isSubmitting, etc.
  const form = useForm({
    resolver: zodResolver(loginSchema), // validate with our Zod schema
    defaultValues: { email: "", password: "" }, // controlled inputs need a starting value (never undefined)
  });
  // TS infers the types from the schema, so no need to write useForm<LoginValues>.

  // Called by handleSubmit ONLY if Zod validation passed, so `values` is guaranteed valid.
  async function onSubmit(values: LoginValues) {
    try {
      await loginRequest(values);
      router.push("/chat"); // BREAK (exercise #3): push adds /login to history, so Back returns to the form
    } catch (err) {
      // "root" = an error for the whole form, not one field (server said no).
      // react-hook-form clears root errors automatically on the next submit.
      form.setError("root", { message: getErrorMessage(err) });
    }
  }

  // Destructure the bits of state we render. isSubmitting is true while onSubmit's promise runs.
  const { isSubmitting, errors } = form.formState;

  return (
    // min-h-svh = at least the full screen height ("small viewport height", mobile-safe)
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Log in</CardTitle>
          <CardDescription>Welcome back. Enter your email and password.</CardDescription>
        </CardHeader>

        {/* form.handleSubmit(onSubmit) = "validate first, call onSubmit only if valid".
            It also calls preventDefault(), so the browser doesn't reload the page.
            noValidate = turn OFF the browser's own popup bubbles so our Zod messages show instead. */}
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
          <CardContent>
            <FieldGroup>
              {/* Controller connects ONE input to the form brain.
                  render receives:
                    field      -> { value, onChange, onBlur, name, ref } to spread onto the input
                    fieldState -> { invalid, error } for this field only */}
              <Controller
                name="email" // must match a key in loginSchema (TS errors if you typo it)
                control={form.control}
                render={({ field, fieldState }) => (
                  // data-invalid lets shadcn style the whole row red
                  <Field data-invalid={fieldState.invalid}>
                    {/* htmlFor <-> HTML `for`: clicking the label focuses the input with that id */}
                    <FieldLabel htmlFor="login-email">Email</FieldLabel>
                    <Input
                      {...field} // spread: same as writing value={field.value} onChange={field.onChange} ...
                      id="login-email"
                      type="email" // mobile shows the @ keyboard
                      autoComplete="email" // lets password managers fill it
                      placeholder="you@example.com"
                      aria-invalid={fieldState.invalid} // screen readers announce "invalid"
                    />
                    {/* && = "render the right side only if the left is true" (short-circuit, same as C++) */}
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />

              <Controller
                name="password"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="login-password">Password</FieldLabel>
                    <Input
                      {...field}
                      id="login-password"
                      type="password" // dots instead of text
                      autoComplete="current-password" // tells password managers "existing password"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />

              {/* Server-side error (wrong password, server down...).
                  role="alert" makes screen readers read it out immediately. */}
              {errors.root && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.root.message}
                </p>
              )}
            </FieldGroup>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            {/* disabled while submitting -> prevents double-click = double login request */}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Logging in..." : "Log in"}
            </Button>
            <p className="text-sm text-muted-foreground">
              No account?{" "}
              {/* {" "} = a literal space; JSX trims whitespace at line breaks */}
              <Link href="/register" className="underline underline-offset-4">
                Register
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
