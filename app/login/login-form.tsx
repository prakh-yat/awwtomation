"use client";

import { useState } from "react";

/** Messages keyed by the `?error=` values produced by `app/auth/callback`. */
const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Google sign-in was cancelled. Try again when you're ready.",
  oauth_failed: "Google didn't complete the sign-in. Please try again.",
  missing_code: "Something went wrong during sign-in. Please try again.",
  expired_state: "That sign-in attempt expired. Please try again.",
  exchange_failed: "We couldn't finish signing you in. Please try again in a moment.",
  not_configured: "Google sign-in isn't set up on this server yet.",
};

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.54-5.17 3.54-8.88Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29V17.37A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.63H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.37l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.94 1.19 15.23 0 12 0A12 12 0 0 0 1.29 6.63l3.98 3.09C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

/**
 * A plain link to `/auth/google`, which mints the PKCE challenge server-side
 * and redirects to Google. No auth SDK in the browser, and sign-in still works
 * if the page's JavaScript never loads: the click handler only exists to show
 * the spinner while the navigation is in flight.
 */
export function LoginForm({ next, error }: { next: string; error?: string }) {
  const [pending, setPending] = useState(false);

  const message = error ? (ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again.") : null;
  const href = `/auth/google?next=${encodeURIComponent(next)}`;

  return (
    <div className="space-y-4">
      {message ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-[13px] leading-5 text-destructive"
        >
          {message}
        </div>
      ) : null}

      <a
        href={href}
        onClick={() => setPending(true)}
        aria-disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-input bg-background px-4 text-[15px] font-medium text-foreground shadow-[0_1px_2px_rgb(24_24_27/0.06)] transition-colors hover:border-foreground/25 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-disabled:pointer-events-none aria-disabled:opacity-60"
      >
        {pending ? (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
          />
        ) : (
          <GoogleIcon />
        )}
        {pending ? "Redirecting to Google…" : "Continue with Google"}
      </a>
    </div>
  );
}
