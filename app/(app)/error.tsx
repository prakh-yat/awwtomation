"use client";

import { usePathname } from "next/navigation";

import { ErrorCard } from "@/components/errors/error-card";
import { isBareShellPath } from "@/lib/workspace/request";

/**
 * Boundary for every page under the app shell. Rendering inside the layout
 * keeps the dock usable, so a broken page never traps the customer. The two
 * pages that draw without the shell (onboarding, welcome) get the full-window
 * version instead. `error.message` is intentionally never rendered: see ErrorCard.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname();
  return <ErrorCard reference={error.digest} onRetry={reset} fullScreen={isBareShellPath(pathname)} />;
}
