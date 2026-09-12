import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SkipReason } from "@/lib/services/analytics";
import { cn, formatNumber } from "@/lib/utils";

import { DELIVERY_STATUS_LABELS } from "./labels";

/** Horizontal bars, longest first. Only FAILED gets the red bar — skips are expected behaviour. */
export function SkipReasons({ reasons }: { reasons: SkipReason[] }) {
  const max = reasons.reduce((m, r) => Math.max(m, r.count), 0);
  const total = reasons.reduce((sum, r) => sum + r.count, 0);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle>Skipped deliveries</CardTitle>
          <CardDescription>
            {total > 0 ? `${formatNumber(total)} DMs didn't go out in this period` : "Why DMs didn't go out in this period"}
          </CardDescription>
        </div>
        <Link href="/logs" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          View logs
        </Link>
      </CardHeader>
      <CardContent>
        {reasons.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <CheckCircle2 className="mb-3 h-5 w-5 text-success" strokeWidth={1.75} />
            <p className="text-sm font-medium">Nothing skipped</p>
            <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">Every eligible DM in this period was delivered.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {reasons.map((r) => {
              const width = max === 0 ? 0 : Math.max(2, Math.round((r.count / max) * 100));
              return (
                <li key={r.status}>
                  <div className="flex items-center justify-between text-[13px]">
                    <span>{DELIVERY_STATUS_LABELS[r.status]}</span>
                    <span className="tabular-nums text-muted-foreground">{formatNumber(r.count)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", r.status === "FAILED" ? "bg-destructive" : "bg-foreground/80")}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
