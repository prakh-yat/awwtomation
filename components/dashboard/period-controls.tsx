"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ChannelPlatform } from "@prisma/client";

import { PlatformIcon } from "@/components/ui/platform-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AnalyticsPeriod } from "@/lib/services/analytics";
import { cn } from "@/lib/utils";

// Mirrors ANALYTICS_PERIODS; kept local so this client bundle never imports the Prisma-backed service.
const PERIODS: readonly AnalyticsPeriod[] = [7, 30, 90];
const DEFAULT_PERIOD: AnalyticsPeriod = 7;
const ALL_CHANNELS = "all";

export type PeriodChannelOption = {
  id: string;
  platform: ChannelPlatform;
  username: string | null;
  name: string | null;
};

export interface PeriodControlsProps {
  days: AnalyticsPeriod;
  channelId: string | null;
  channels: PeriodChannelOption[];
}

export function buildDashboardHref(days: AnalyticsPeriod, channelId: string | null): string {
  const params = new URLSearchParams();
  if (days !== DEFAULT_PERIOD) params.set("days", String(days));
  if (channelId) params.set("channel", channelId);
  const qs = params.toString();
  return qs ? `/dashboard?${qs}` : "/dashboard";
}

function channelLabel(c: PeriodChannelOption): string {
  if (c.username) return `@${c.username.replace(/^@/, "")}`;
  return c.name ?? (c.platform === "INSTAGRAM" ? "Instagram" : "Facebook");
}

/**
 * Period segmented control + channel filter. Both live in the URL so the
 * server page re-renders with fresh data and the view is shareable.
 */
export function PeriodControls({ days, channelId, channels }: PeriodControlsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(nextDays: AnalyticsPeriod, nextChannel: string | null) {
    startTransition(() => router.push(buildDashboardHref(nextDays, nextChannel)));
  }

  return (
    <div className={cn("flex items-center gap-2 transition-opacity", pending && "opacity-60")} aria-busy={pending || undefined}>
      {channels.length > 1 ? (
        <Select value={channelId ?? ALL_CHANNELS} onValueChange={(v) => navigate(days, v === ALL_CHANNELS ? null : v)}>
          <SelectTrigger className="h-9 w-[200px]" aria-label="Account">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value={ALL_CHANNELS}>All accounts</SelectItem>
            {channels.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="flex items-center gap-2">
                  <PlatformIcon platform={c.platform} size={13} className="text-muted-foreground" />
                  {channelLabel(c)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <div role="radiogroup" aria-label="Period" className="inline-flex h-9 items-center rounded-lg bg-muted p-1">
        {PERIODS.map((p) => {
          const active = p === days;
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => navigate(p, channelId)}
              className={cn(
                "h-7 rounded-md px-3 text-[13px] font-medium tabular-nums transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p}d
            </button>
          );
        })}
      </div>
    </div>
  );
}
