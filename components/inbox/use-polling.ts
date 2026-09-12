"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Runs `fn` every `intervalMs` while the tab is visible, plus once
 * immediately when the tab becomes visible again (so a user coming back
 * sees fresh data without waiting a full interval). The latest `fn` is
 * always used, so callers don't need to memoize it.
 */
export function useVisiblePolling(fn: () => void | Promise<void>, intervalMs: number, enabled = true): void {
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;

    const tick = () => {
      if (document.visibilityState === "visible") void fnRef.current();
    };
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      timer = window.setInterval(tick, intervalMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
        start();
      } else {
        stop();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}

/** Re-renders on an interval so relative times and window countdowns stay honest. Returns `Date.now()`. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
