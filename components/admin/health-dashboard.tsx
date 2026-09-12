"use client";

import * as React from "react";
import Link from "next/link";
import { Pause, Play, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import type { PlatformHealth } from "@/lib/services/admin";
import { formatNumber } from "@/lib/utils";

import { adminFetch } from "./api";
import { formatRelative, formatUtc } from "./format";
import { HealthChecks, WORKER_LABEL, WORKER_TONE } from "./health-checks";
import { StatusDot, type Tone } from "./status-badge";
import { TimeAgo } from "./time-ago";

const POLL_MS = 15_000;

const OVERALL: Record<PlatformHealth["status"], { label: string; tone: Tone; description: string }> = {
  ok: { label: "All systems operational", tone: "success", description: "Database reachable, worker active, nothing stuck." },
  degraded: { label: "Degraded", tone: "warning", description: "Something needs attention — see the checks below." },
  down: {
    label: "Database unreachable",
    tone: "destructive",
    description: "Nothing works without Postgres. Check DATABASE_URL and the Supabase project status.",
  },
};

const WORKER_HINT: Record<PlatformHealth["worker"]["status"], string> = {
  healthy: "A worker touched a job in the last 5 minutes.",
  idle: "No job activity in the last 5 minutes, but nothing is waiting either — normal during quiet periods.",
  stale: "Due jobs have gone unclaimed for over 2 minutes. Is `npm run worker` running?",
  unknown: "No jobs have ever been processed, so worker liveness can't be inferred yet.",
};

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs tabular-nums" : "tabular-nums"}>{value}</span>
    </div>
  );
}

function ConfigRow({ label, ok, hint }: { label: string; ok: boolean; hint: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusDot tone={ok ? "success" : "warning"} />
        <div className="min-w-0">
          <p className="text-[13px] font-medium leading-5">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{ok ? "Set" : "Missing"}</span>
    </li>
  );
}

export function HealthDashboard({ initial }: { initial: PlatformHealth }) {
  const [health, setHealth] = React.useState(initial);
  const [loading, setLoading] = React.useState(false);
  const [auto, setAuto] = React.useState(true);

  const refresh = React.useCallback(async (silent: boolean) => {
    setLoading(true);
    try {
      setHealth(await adminFetch<PlatformHealth>("/api/admin/health"));
    } catch (err) {
      if (!silent) toast.error(err instanceof Error ? err.message : "Could not refresh health");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => {
      // Don't hammer the DB from background tabs.
      if (document.visibilityState === "visible") void refresh(true);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [auto, refresh]);

  const overall = OVERALL[health.status];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <StatusDot tone={overall.tone} pulse={overall.tone !== "success"} className="h-2.5 w-2.5" />
            <div>
              <p className="text-sm font-medium">{overall.label}</p>
              <p className="text-[13px] text-muted-foreground">{overall.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span suppressHydrationWarning title={formatUtc(health.checkedAt)}>
              Checked {formatRelative(health.checkedAt)}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setAuto((v) => !v)} aria-pressed={auto}>
              {auto ? <Pause /> : <Play />}
              {auto ? "Auto-refresh on" : "Auto-refresh off"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void refresh(false)} loading={loading}>
              {loading ? null : <RefreshCw />}
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Checks</CardTitle>
            <CardDescription>Green is healthy; amber needs a look; red is an outage.</CardDescription>
          </CardHeader>
          <CardContent>
            <HealthChecks health={health} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle>Worker</CardTitle>
                <CardDescription>Inferred from job activity.</CardDescription>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs">
                <StatusDot tone={WORKER_TONE[health.worker.status]} />
                {WORKER_LABEL[health.worker.status]}
              </span>
            </CardHeader>
            <CardContent className="divide-y">
              <p className="pb-2 text-xs text-muted-foreground">{WORKER_HINT[health.worker.status]}</p>
              <Row label="Last activity" value={<TimeAgo iso={health.worker.lastSeenAt} />} />
              <Row label="Due jobs" value={formatNumber(health.worker.dueJobs)} />
              <Row label="Oldest due" value={<TimeAgo iso={health.worker.oldestDueAt} />} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle>Queue</CardTitle>
                <CardDescription>Jobs by status.</CardDescription>
              </div>
              <Link href="/admin/jobs" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Open
              </Link>
            </CardHeader>
            <CardContent className="divide-y">
              <Row label="Pending" value={`${formatNumber(health.queue.PENDING)} (${formatNumber(health.queue.due)} due)`} />
              <Row label="Processing" value={formatNumber(health.queue.PROCESSING)} />
              <Row label="Failed" value={formatNumber(health.queue.FAILED)} />
              <Row label="Completed" value={formatNumber(health.queue.COMPLETED)} />
              <Row label="Cancelled" value={formatNumber(health.queue.CANCELLED)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>Presence only — values are never shown.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                <ConfigRow label="Instagram app" ok={health.config.instagram} hint="INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET" />
                <ConfigRow label="Facebook app" ok={health.config.facebook} hint="META_APP_ID / META_APP_SECRET" />
                <ConfigRow label="Webhook verify token" ok={health.config.webhookVerifyToken} hint="META_WEBHOOK_VERIFY_TOKEN" />
                <ConfigRow label="Cron secret" ok={health.config.cronSecret} hint="CRON_SECRET guards /api/cron/*" />
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
