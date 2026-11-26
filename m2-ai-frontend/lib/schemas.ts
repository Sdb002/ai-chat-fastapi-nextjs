// Zod = Pydantic for the browser. Each schema is a set of rules + a TypeScript type.
import { z } from "zod"; // z is the namespace holding every Zod builder (like `import pydantic`)

// ---------- LOGIN ----------
// z.object({...})  <->  class LoginIn(BaseModel): ...
export const loginSchema = z.object({
  // z.email() <-> EmailStr. In Zod 4, email is a top-level builder (old Zod 3: z.string().email()).
  // { error: "..." } is the message shown when the rule fails (Zod 4 renamed `message` -> `error`).
  email: z.email({ error: "Enter a valid email address" }),

  // On login we only check "not empty": the SERVER decides if the password is right.
  // Putting length rules here would leak your password policy for no benefit.
  password: z.string().min(1, { error: "Password is required" }),
});

// ---------- REGISTER ----------
export const registerSchema = z
  .object({
    email: z.email({ error: "Enter a valid email address" }),

    // Keep this in sync with your FastAPI Pydantic rule.
    // .max(128) blocks absurd inputs; argon2 has no 72-byte limit (that's bcrypt), 128 is just sanity.
    password: z
      .string()
      .min(8, { error: "Use at least 8 characters" })
      .max(128, { error: "Keep it under 128 characters" }),

    // Exists only in the browser: we never send it to the backend.
    confirmPassword: z.string().min(1, { error: "Please confirm your password" }),
  })
  // .refine(check, options) = a rule that looks at MORE THAN ONE field (<-> Pydantic @model_validator).
  // `data` is the whole object after the per-field rules passed.
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords do not match",
    // path = WHICH field the error attaches to. Without it, the error belongs to the whole object
    // and no input shows it. (Break exercise #1 — restored on m2d18.)
    path: ["confirmPassword"],
  });

// z.infer<typeof schema> pulls a TypeScript type OUT of the schema.
// `typeof loginSchema` = "the type of this value"; z.infer converts rule-object -> plain data type.
// Result: { email: string; password: string }. One source of truth, never write the type by hand.
export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
