import { MousePointerClick, Percent, Send, UserPlus, Zap } from "lucide-react";

import { StatCard, type StatCardProps } from "@/components/ui/stat-card";
import type { AnalyticsPeriod, OverviewDeltas, OverviewTotals } from "@/lib/services/analytics";
import { formatNumber, formatPercent } from "@/lib/utils";

export interface StatRowProps {
  totals: OverviewTotals;
  deltas: OverviewDeltas;
  days: AnalyticsPeriod;
}

/** A null delta means the previous period was empty — say so instead of pretending it's 0%. */
function deltaProps(delta: number | null, current: number, days: AnalyticsPeriod): Pick<StatCardProps, "delta" | "hint"> {
  if (delta === null) {
    return current > 0 ? { delta: "new", hint: `Nothing in the previous ${days} days` } : { hint: `vs previous ${days} days` };
  }
  return { delta, hint: `vs previous ${days} days` };
}

export function StatRow({ totals, deltas, days }: StatRowProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard label="DMs sent" value={formatNumber(totals.dmsSent)} icon={Send} {...deltaProps(deltas.dmsSent, totals.dmsSent, days)} />
      <StatCard label="Triggers" value={formatNumber(totals.triggered)} icon={Zap} {...deltaProps(deltas.triggered, totals.triggered, days)} />
      <StatCard
        label="Link clicks"
        value={formatNumber(totals.linkClicks)}
        icon={MousePointerClick}
        {...deltaProps(deltas.linkClicks, totals.linkClicks, days)}
      />
      <StatCard label="Click-through rate" value={formatPercent(totals.ctr)} icon={Percent} {...deltaProps(deltas.ctr, totals.ctr, days)} />
      <StatCard
        label="New contacts"
        value={formatNumber(totals.newContacts)}
        icon={UserPlus}
        {...deltaProps(deltas.newContacts, totals.newContacts, days)}
      />
    </div>
  );
}
