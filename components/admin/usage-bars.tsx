import type { AdminWorkspaceUsage } from "@/lib/services/admin";
import { cn, formatNumber } from "@/lib/utils";

function percent(used: number, limit: number): number {
  return limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
}

export function UsageBars({ usage }: { usage: AdminWorkspaceUsage }) {
  const rows = [
    { label: "DMs this period", ...usage.dms },
    { label: "Channels", ...usage.channels },
    { label: "Automations", ...usage.automations },
    { label: "Seats (members + pending invites)", ...usage.members },
  ];
  return (
    <ul className="space-y-4">
      {rows.map((r) => {
        const p = percent(r.used, r.limit);
        // Fill stays black until the plan is nearly exhausted; color only signals a problem.
        const fill = p >= 100 ? "bg-destructive" : p >= 80 ? "bg-warning" : "bg-foreground";
        return (
          <li key={r.label}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
              <span>{r.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatNumber(r.used)} / {formatNumber(r.limit)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
              <div className={cn("h-full rounded-full", fill)} style={{ width: `${p}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
