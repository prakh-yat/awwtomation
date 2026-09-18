import { z } from "zod";

/**
 * Server environment. Parsed lazily so `next build` and the worker can boot
 * without every secret present; anything that is genuinely required throws
 * a readable error the first time it is used.
 */
/**
 * Treat a blank value in .env ("" once parsed) as "not set", so an optional key
 * left empty doesn't fail its format check.
 */
function emptyAsUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());
}

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional(),

  // Google sign-in. Optional at the schema level, then required below unless the
  // dev sign-in bypass is active: local development with DEV_AUTH_EMAIL never
  // talks to Google, and demanding credentials there produced a boot error for a
  // dependency the process genuinely does not use. The same applies to the
  // worker, which has no HTTP surface at all.
  // `emptyAsUndefined` matters: a key left blank in .env arrives as "", which
  // `.optional()` alone would still run through `.min(1)` and reject.
  GOOGLE_CLIENT_ID: emptyAsUndefined(z.string().min(1)),
  GOOGLE_CLIENT_SECRET: emptyAsUndefined(z.string().min(1)),

  /** base64 of 32 random bytes: `openssl rand -base64 32` */
  APP_ENCRYPTION_KEY: z.string().min(32),
  CRON_SECRET: z.string().min(8).optional(),

  META_GRAPH_API_VERSION: z.string().default("v25.0"),
  /** Facebook app (Facebook Login for Pages, Messenger, webhook signature). */
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  /** Instagram Login product credentials (separate from the Facebook app id). */
  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),

  /** Dev-only: sign in as this email without Google (ignored unless NODE_ENV=development). */
  DEV_AUTH_EMAIL: z.string().optional(),

  /** Dodo Payments */
  DODO_MODE: z.enum(["test", "live"]).default("test"),
  DODO_SECRET_KEY: z.string().optional(),
  DODO_WEBHOOK_SECRET: z.string().optional(),
  DODO_PRODUCT_STARTER_MONTHLY: z.string().optional(),
  DODO_PRODUCT_STARTER_ANNUAL: z.string().optional(),
  DODO_PRODUCT_PRO_MONTHLY: z.string().optional(),
  DODO_PRODUCT_PRO_ANNUAL: z.string().optional(),
  DODO_PRODUCT_AGENCY_MONTHLY: z.string().optional(),
  DODO_PRODUCT_AGENCY_ANNUAL: z.string().optional(),
  DODO_ALLOW_TEST_MODE_IN_PRODUCTION: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  /** Worker tuning */
  WORKER_POLL_INTERVAL_MS: z.coerce.number().default(2000),
  WORKER_BATCH_SIZE: z.coerce.number().default(10),
  COMMENT_POLL_INTERVAL_MS: z.coerce.number().default(5 * 60_000),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\n\nSee .env.example`);
  }

  // Google is the auth provider, so its credentials are required unless the
  // development sign-in bypass is standing in for them. `devAuthEmail()` is
  // itself gated on NODE_ENV === "development", so a production deploy can never
  // reach this branch and skip the check.
  // Read NODE_ENV from the PARSED data, not process.env: the worker runs under
  // plain `tsx` with NODE_ENV unset, where the schema's "development" default
  // applies. Reading the raw value there made this guard reject a process that
  // never signs anybody in at all.
  const usingDevAuth =
    parsed.data.NODE_ENV === "development" && Boolean(parsed.data.DEV_AUTH_EMAIL?.trim());
  if (!usingDevAuth && (!parsed.data.GOOGLE_CLIENT_ID || !parsed.data.GOOGLE_CLIENT_SECRET)) {
    throw new Error(
      "Invalid environment configuration:\n" +
        "  - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for Google sign-in.\n" +
        "    Google Cloud Console -> APIs & Services -> Credentials -> OAuth client ID (Web application).\n" +
        "    (In local development you can set DEV_AUTH_EMAIL instead to skip Google.)\n\nSee .env.example",
    );
  }

  cached = parsed.data;
  return cached;
}

/** Non-throwing accessor for optional integrations (returns undefined when unset). */
export function optionalEnv<K extends keyof ServerEnv>(key: K): ServerEnv[K] | undefined {
  try {
    return getEnv()[key];
  } catch {
    return process.env[key] as ServerEnv[K] | undefined;
  }
}

export function appUrl(path = ""): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}


export function isMetaConfigured(): { instagram: boolean; facebook: boolean } {
  return {
    instagram: Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET),
    facebook: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
  };
}
