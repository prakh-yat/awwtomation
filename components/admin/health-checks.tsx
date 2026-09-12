import Link from "next/link";

import type { PlatformHealth, WorkerStatus } from "@/lib/services/admin";
import { cn } from "@/lib/utils";

import { formatMs, formatRelative } from "./format";
import { StatusDot, type Tone } from "./status-badge";

export type HealthCheck = { key: string; label: string; tone: Tone; value: string; href?: string; detail?: string };

export const WORKER_TONE: Record<WorkerStatus, Tone> = {
  healthy: "success",
  idle: "muted",
  stale: "destructive",
  unknown: "warning",
};

export const WORKER_LABEL: Record<WorkerStatus, string> = {
  healthy: "Healthy",
  idle: "Idle",
  stale: "Stale",
  unknown: "Unknown",
};

export function buildChecks(h: PlatformHealth): HealthCheck[] {
  const metaApps = [h.config.instagram ? "Instagram" : null, h.config.facebook ? "Facebook" : null].filter(Boolean);
  return [
    {
      key: "db",
      label: "Database",
      tone: h.db.ok ? "success" : "destructive",
      value: h.db.ok ? formatMs(h.db.latencyMs) : "Unreachable",
      detail: h.db.error ?? "SELECT 1 round-trip",
    },
    {
      key: "worker",
      label: "Worker",
      tone: WORKER_TONE[h.worker.status],
      value: WORKER_LABEL[h.worker.status],
      detail: h.worker.lastSeenAt ? `Last job activity ${formatRelative(h.worker.lastSeenAt)}` : "No job activity recorded yet",
    },
    {
      key: "queue",
      label: "Queue",
      tone: h.queue.due > 50 ? "warning" : h.queue.due > 0 ? "muted" : "success",
      value: `${h.queue.due} due · ${h.queue.PROCESSING} running`,
      href: "/admin/jobs",
    },
    {
      key: "stale",
      label: "Stale locks",
      tone: h.staleJobs > 0 ? "warning" : "success",
      value: String(h.staleJobs),
      detail: "Processing for over 10 minutes; released by the worker's next sweep",
      href: "/admin/jobs?status=PROCESSING",
    },
    {
      key: "failed",
      label: "Failed jobs",
      tone: h.queue.FAILED > 0 ? "warning" : "success",
      value: String(h.queue.FAILED),
      href: "/admin/jobs?status=FAILED",
    },
    {
      key: "channels",
      label: "Channels in error",
      tone: h.channelsInError > 0 ? "warning" : "success",
      value: String(h.channelsInError),
      detail: "Token expired or last API call failed; the owner must reconnect",
    },
    {
      key: "tokens",
      label: "Tokens expiring within 10 days",
      tone: h.tokenExpiringSoon > 0 ? "warning" : "success",
      value: String(h.tokenExpiringSoon),
      detail: "Instagram long-lived tokens the worker will try to refresh",
    },
    {
      key: "webhooks",
      label: "Webhooks (24h)",
      tone: h.webhooks.errors24h > 0 ? "warning" : h.webhooks.last24h > 0 ? "success" : "muted",
      value: `${h.webhooks.last24h} received · ${h.webhooks.errors24h} errors`,
      detail: h.webhooks.lastReceivedAt ? `Last received ${formatRelative(h.webhooks.lastReceivedAt)}` : "Nothing received yet",
      href: "/admin/webhooks",
    },
    {
      key: "meta",
      label: "Meta app credentials",
      tone: metaApps.length === 2 ? "success" : metaApps.length === 1 ? "warning" : "destructive",
      value: metaApps.length ? metaApps.join(" · ") : "None configured",
    },
  ];
}

/** Status-dot list used by both the overview card and the health page. */
export function HealthChecks({ health, compact = false }: { health: PlatformHealth; compact?: boolean }) {
  return (
    <ul className="divide-y">
      {buildChecks(health).map((c) => (
        <li key={c.key} className={cn("flex items-center justify-between gap-3", compact ? "py-1.5" : "py-2.5")}>
          <div className="flex min-w-0 items-center gap-2.5">
            <StatusDot tone={c.tone} pulse={c.tone === "destructive"} />
            <div className="min-w-0">
              <p className="text-[13px] font-medium leading-5">{c.label}</p>
              {!compact && c.detail ? (
                <p className="truncate text-xs text-muted-foreground" suppressHydrationWarning>
                  {c.detail}
                </p>
              ) : null}
            </div>
          </div>
          {c.href ? (
            <Link
              href={c.href}
              className="shrink-0 text-xs tabular-nums text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {c.value}
            </Link>
          ) : (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{c.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
