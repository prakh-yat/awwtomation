"use client";

import { useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { GoogleIcon } from "@/components/ui/google-icon";
import { cn } from "@/lib/utils";

/** Messages keyed by the `?error=` values produced by `app/auth/callback`. */
const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Sign-in was cancelled. Try again when you’re ready.",
  oauth_failed: "Google didn’t finish signing you in. Try again.",
  missing_code: "Sign-in didn’t finish. Try again.",
  expired_state: "That sign-in took too long. Try again.",
  exchange_failed: "We couldn’t finish signing you in. Try again in a moment.",
  not_configured: "Signing in with Google isn’t available yet.",
};

/**
 * A plain link to `/auth/google`, which mints the PKCE challenge server-side
 * and redirects to Google. No auth SDK in the browser, and sign-in still works
 * if the page's JavaScript never loads: the click handler only exists to show
 * the spinner while the navigation is in flight.
 */
export function LoginForm({ next, error }: { next: string; error?: string }) {
  const [pending, setPending] = useState(false);

  const message = error ? (ERROR_MESSAGES[error] ?? "Sign-in didn’t work. Try again.") : null;
  const href = `/auth/google?next=${encodeURIComponent(next)}`;

  return (
    <div className="space-y-4">
      {message ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-2xl bg-destructive/10 px-4 py-3 text-[13px] leading-5 text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{message}</p>
        </div>
      ) : null}

      <a
        href={href}
        onClick={() => setPending(true)}
        aria-disabled={pending}
        className={cn(
          buttonVariants({ size: "lg" }),
          "relative h-12 w-full px-12 text-[15px] aria-disabled:pointer-events-none aria-disabled:opacity-70",
        )}
      >
        <span className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink">
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <GoogleIcon />}
        </span>
        {pending ? "Opening Google…" : "Continue with Google"}
      </a>
    </div>
  );
}
