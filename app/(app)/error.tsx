"use client";

import { ErrorCard } from "@/components/errors/error-card";

/**
 * Boundary for every page under the app shell. Rendering inside the layout
 * keeps the sidebar usable, so a broken page never traps the customer.
 * `error.message` is intentionally never rendered — see ErrorCard.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorCard reference={error.digest} onRetry={reset} />;
}
