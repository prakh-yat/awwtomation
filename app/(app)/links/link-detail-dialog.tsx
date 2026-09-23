"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowUpRight, MousePointerClick, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import type { TrackedLinkListItem, TrackedLinkStats } from "@/lib/services/links";
import { formatNumber } from "@/lib/utils";

import { errorMessage, linksApi } from "./api";
import { ClickSparkline } from "./click-sparkline";
import { describeUserAgent, displayDestination, formatDateTime } from "./format";
import { SourceBadge } from "./source-badge";

const STATS_DAYS = 30;

export interface LinkDetailDialogProps {
  link: TrackedLinkListItem | null;
  timezone: string;
  onOpenChange: (open: boolean) => void;
  onEdit: (link: TrackedLinkListItem) => void;
  onDelete: (link: TrackedLinkListItem) => void;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-xl bg-fog px-3 py-2.5">
      <p className="brand-label truncate text-muted-foreground">{label}</p>
      <p className="font-display mt-1.5 text-[22px] leading-none tabular-nums">{formatNumber(value)}</p>
    </div>
  );
}

/** Opened from a table row: 30-day sparkline plus the last 20 taps. Stats load on open; the row data renders immediately. */
export function LinkDetailDialog({ link, timezone, onOpenChange, onEdit, onDelete }: LinkDetailDialogProps) {
  const [stats, setStats] = React.useState<TrackedLinkStats | null>(null);
  const [loading, setLoading] = React.useState(false);
  const linkId = link?.id ?? null;

  React.useEffect(() => {
    if (!linkId) return;
    const controller = new AbortController();
    setStats(null);
    setLoading(true);
    linksApi
      .stats(linkId, STATS_DAYS, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setStats(result);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        toast.error(errorMessage(err, "Couldn't load click history"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [linkId]);

  // Counts from the freshly loaded stats win over the (possibly stale) row.
  const current = stats?.link ?? link;

  return (
    <Dialog open={link !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto scrollbar-thin">
        {link && current ? (
          <>
            <DialogHeader>
              <DialogTitle className="truncate">{current.label || `/l/${current.slug}`}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-sky-soft py-0.5 pl-3 pr-0.5">
                    <code className="min-w-0 truncate font-mono text-[12px] text-ink">{current.shortUrl}</code>
                    <CopyButton value={current.shortUrl} variant="ghost" className="h-7 w-7 hover:bg-background/60" successMessage="Short link copied" />
                  </span>
                  <SourceBadge link={current} />
                </div>
              </DialogDescription>
            </DialogHeader>

            <a
              href={current.destinationUrl}
              target="_blank"
              rel="noreferrer"
              className="-mt-2 inline-flex max-w-full items-center gap-1 justify-self-start text-[13px] text-muted-foreground outline-none hover:text-ink focus-visible:underline"
              title={current.destinationUrl}
            >
              <span className="truncate">Opens {displayDestination(current.destinationUrl, 60)}</span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </a>

            <div className="grid grid-cols-3 gap-2">
              {stats ? <MiniStat label={`${stats.days} days`} value={stats.clicksInRange} /> : <Skeleton className="h-[66px] rounded-xl" />}
              <MiniStat label="7 days" value={current.clicks7d} />
              <MiniStat label="All time" value={current.clickCount} />
            </div>

            <section aria-labelledby="link-clicks-per-day">
              <h3 id="link-clicks-per-day" className="brand-label mb-2 text-muted-foreground">
                Clicks per day
              </h3>
              {stats ? <ClickSparkline data={stats.series} /> : <Skeleton className="h-[138px] w-full rounded-xl" />}
            </section>

            <section aria-labelledby="link-recent-clicks">
              <h3 id="link-recent-clicks" className="brand-label mb-2 text-muted-foreground">
                Recent clicks
              </h3>
              {loading && !stats ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }, (_, i) => (
                    <Skeleton key={i} className="h-9 w-full rounded-xl" />
                  ))}
                </div>
              ) : stats && stats.recentClicks.length > 0 ? (
                <ul className="max-h-56 divide-y overflow-y-auto rounded-xl border scrollbar-thin">
                  {stats.recentClicks.map((click, i) => (
                    <li
                      key={click.id}
                      className="rise flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]"
                      style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
                    >
                      <span className="min-w-0 truncate">
                        {click.contact ? (
                          <Link href={`/contacts/${click.contact.id}`} className="font-semibold hover:underline">
                            {click.contact.username ? `@${click.contact.username}` : (click.contact.name ?? "Contact")}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Anonymous</span>
                        )}
                        <span className="text-muted-foreground"> · {describeUserAgent(click.userAgent)}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDateTime(click.createdAt, timezone)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex items-center gap-2.5 rounded-xl bg-fog px-3 py-3.5 text-[13px] text-muted-foreground">
                  <MousePointerClick className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  No one has tapped this link yet.
                </div>
              )}
            </section>

            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onDelete(link)}>
                <Trash2 />
                Delete
              </Button>
              <Button type="button" variant="outline" onClick={() => onEdit(link)}>
                <Pencil />
                Edit
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
