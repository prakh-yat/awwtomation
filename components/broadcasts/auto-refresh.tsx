"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the server component tree on an interval while a broadcast is
 * SENDING, pausing when the tab is hidden. Renders nothing.
 */
function AutoRefresh({ intervalMs = 5000, enabled = true }: { intervalMs?: number; enabled?: boolean }) {
  const router = useRouter();

  React.useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs, router]);

  return null;
}

export { AutoRefresh };
