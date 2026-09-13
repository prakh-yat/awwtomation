"use client";

import Link from "next/link";
import * as React from "react";
import { ExternalLink, MousePointerClick, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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

const STATS_DAYS = 30;

export interface LinkDetailDialogProps {
  link: TrackedLinkListItem | null;
  timezone: string;
  onOpenChange: (open: boolean) => void;
  onEdit: (link: TrackedLinkListItem) => void;
  onDelete: (link: TrackedLinkListItem) => void;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">{formatNumber(value)}</p>
    </div>
  );
}

function SourceBadge({ link }: { link: TrackedLinkListItem }) {
  if (link.automation) {
    return (
      <Badge variant="outline" className="max-w-full">
        <Link href={`/automations/${link.automation.id}`} className="truncate hover:underline">
          Automation · {link.automation.name}
        </Link>
      </Badge>
    );
  }
  if (link.broadcast) {
    return (
      <Badge variant="outline" className="max-w-full">
        <Link href={`/broadcasts/${link.broadcast.id}`} className="truncate hover:underline">
          Broadcast · {link.broadcast.name}
        </Link>
      </Badge>
    );
  }
  return <Badge variant="secondary">Manual</Badge>;
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
      <DialogContent className="max-w-xl">
        {link && current ? (
          <>
            <DialogHeader>
              <DialogTitle className="truncate pr-6">{current.label || `/l/${current.slug}`}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <code className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-xs">{current.shortUrl}</code>
                  <CopyButton value={current.shortUrl} variant="ghost" className="h-7 w-7" successMessage="Short link copied" />
                  <SourceBadge link={current} />
                </div>
              </DialogDescription>
            </DialogHeader>

            <a
              href={current.destinationUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
              title={current.destinationUrl}
            >
              <span className="truncate">{displayDestination(current.destinationUrl, 60)}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>

            <div className="grid grid-cols-3 gap-2">
              {stats ? <Stat label={`Last ${stats.days} days`} value={stats.clicksInRange} /> : <Skeleton className="h-[58px]" />}
              <Stat label="Last 7 days" value={current.clicks7d} />
              <Stat label="All time" value={current.clickCount} />
            </div>

            <div>
              <p className="mb-2 text-[13px] font-medium">Clicks per day</p>
              {stats ? <ClickSparkline data={stats.series} /> : <Skeleton className="h-[136px] w-full" />}
            </div>

            <div>
              <p className="mb-2 text-[13px] font-medium">Recent clicks</p>
              {loading && !stats ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }, (_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : stats && stats.recentClicks.length > 0 ? (
                <ul className="max-h-56 divide-y overflow-y-auto rounded-md border scrollbar-thin">
                  {stats.recentClicks.map((click) => (
                    <li key={click.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                      <span className="min-w-0 truncate">
                        {click.contact ? (
                          <Link href={`/contacts/${click.contact.id}`} className="font-medium hover:underline">
                            {click.contact.username ? `@${click.contact.username}` : (click.contact.name ?? "Contact")}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Anonymous</span>
                        )}
                        <span className="text-muted-foreground"> · {describeUserAgent(click.userAgent)}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{formatDateTime(click.createdAt, timezone)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-4 text-[13px] text-muted-foreground">
                  <MousePointerClick className="h-4 w-4" strokeWidth={1.75} />
                  No one has tapped this link yet.
                </div>
              )}
            </div>

            <DialogFooter className="mt-1 gap-2 sm:justify-between sm:gap-0">
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(link)}>
                <Trash2 />
                Delete
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => onEdit(link)}>
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
