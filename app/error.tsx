"use client";

import { ErrorCard } from "@/components/errors/error-card";

/**
 * Root route boundary (pricing, auth and anything outside the app shell).
 * Only `digest` is rendered: Next already logs the underlying error on the
 * server with the same digest, so the customer gets a reference and nothing
 * else about the failure.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorCard reference={error.digest} onRetry={reset} fullScreen />;
}
