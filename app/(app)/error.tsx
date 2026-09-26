"use client";

import { ErrorCard } from "@/components/errors/error-card";

/**
 * Boundary for the pages that draw without the shell (onboarding, welcome) and
 * for the shell's own layout failing: there is no dock to keep, so it takes the
 * whole window. `error.message` is intentionally never rendered: see ErrorCard.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorCard reference={error.digest} onRetry={reset} fullScreen />;
}
