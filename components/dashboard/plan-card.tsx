import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { OrganizationUsage } from "@/lib/billing/usage";
import { cn, formatNumber } from "@/lib/utils";

function shortDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The fill says how close to the limit; the track is a lighter step of the same colour. */
const METER = {
  ok: { fill: "bg-purple", track: "bg-purple/15" },
  near: { fill: "bg-orange", track: "bg-orange/15" },
  full: { fill: "bg-destructive", track: "bg-destructive/15" },
} as const;

/** This month's DMs against the plan, and the way to more of them. */
export function PlanCard({ usage, canManageBilling, className }: { usage: OrganizationUsage; canManageBilling: boolean; className?: string }) {
  const { used, limit } = usage.dms;
  const share = limit > 0 ? Math.min(used / limit, 1) : 1;
  const near = share >= 0.8;
  const meter = METER[share >= 1 ? "full" : near ? "near" : "ok"];

  return (
    <section aria-labelledby="plan-usage-title" className={cn("rounded-2xl bg-fog px-4 py-3.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="plan-usage-title" className="flex items-center gap-2 text-[15px] font-semibold leading-tight">
          DMs this month
          <Badge variant="outline">{usage.limits.label}</Badge>
        </h2>
        <Link
          href={canManageBilling ? "/settings/billing" : "/usage"}
          className={cn(
            "text-[12px] font-semibold underline-offset-4 transition-colors hover:underline",
            near && canManageBilling ? "text-ink" : "text-muted-foreground hover:text-ink",
          )}
        >
          {canManageBilling ? (near ? "Upgrade" : "Manage plan") : "Usage"}
        </Link>
      </div>

      <p className="mt-2.5 flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">
          <span className="font-display text-[24px] leading-none text-ink">{formatNumber(used)}</span> of {formatNumber(limit)}
        </span>
        <span className="text-[12px] tabular-nums text-muted-foreground">Resets {shortDate(usage.periodEnd)}</span>
      </p>
      <div
        className={cn("mt-2 h-2 w-full overflow-hidden rounded-full", meter.track)}
        role="progressbar"
        aria-label="DMs used this month"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
      >
        <div className={cn("h-full rounded-full", meter.fill)} style={{ width: `${Math.max(share * 100, used > 0 ? 1 : 0)}%` }} />
      </div>
    </section>
  );
}
