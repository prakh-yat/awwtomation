import Link from "next/link";

import { CardLink } from "@/components/analytics/card-link";
import { AutomationStatusBadge } from "@/components/automations/badges";
import { stagger } from "@/components/charts/stagger";
import { VIZ } from "@/components/charts/tokens";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PlatformMark } from "@/components/ui/platform-badge";
import type { TopAutomation } from "@/lib/services/analytics";
import { cn, formatNumber } from "@/lib/utils";

import { contactHandle } from "./labels";

function rate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
}

/**
 * The automations that sent the most DMs, as a ranked list: each bar is
 * scaled to the leader, and the figures beside it are exact.
 */
export function TopAutomations({
  automations,
  days,
  showAccount = true,
  className,
}: {
  automations: TopAutomation[];
  days: number;
  /** Off when the workspace has a single account, where the line would repeat one handle. */
  showAccount?: boolean;
  className?: string;
}) {
  const max = Math.max(1, ...automations.map((a) => a.sent));

  return (
    <Card className={cn("flex flex-col overflow-hidden", className)}>
      <CardHeader className="shrink-0 flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>Top automations</CardTitle>
        <CardLink href="/automations">View all</CardLink>
      </CardHeader>

      {automations.length === 0 ? (
        <p className="flex-1 border-t px-5 py-8 text-[13px] text-muted-foreground">No automation sent a DM in the last {days} days.</p>
      ) : (
        <ol className="scrollbar-thin min-h-0 flex-1 divide-y overflow-y-auto border-t">
          {automations.map((a, i) => (
            <li key={a.id} className="rise" style={stagger(i)}>
              <Link
                href={`/automations/${a.id}`}
                className="flex items-center gap-3 px-5 py-3 outline-none transition-colors hover:bg-fog/70 focus-visible:bg-fog"
              >
                <span className="font-display w-5 shrink-0 text-[15px] text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[14px] font-semibold" title={a.name}>
                      {a.name}
                    </span>
                    {a.status !== "ACTIVE" ? <AutomationStatusBadge status={a.status} className="shrink-0" /> : null}
                  </span>
                  {showAccount ? (
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <PlatformMark platform={a.channel.platform} size={14} />
                      <span className="truncate">{contactHandle(a.channel.username, a.channel.name)}</span>
                    </span>
                  ) : null}
                  <span className="mt-2 block h-1.5 rounded-r-[4px] bg-fog" aria-hidden>
                    <span
                      className="block h-full rounded-r-[4px]"
                      style={{ width: `${Math.max((a.sent / max) * 100, a.sent > 0 ? 2 : 0)}%`, backgroundColor: VIZ.accent }}
                    />
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[15px] font-semibold tabular-nums">
                    {formatNumber(a.sent)}
                    <span className="sr-only"> DMs sent</span>
                  </span>
                  <span className="block text-xs tabular-nums text-muted-foreground">{rate(a.ctr)} clicked</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
