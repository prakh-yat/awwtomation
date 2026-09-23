"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ChannelPlatform } from "@prisma/client";

import { PlatformMark } from "@/components/ui/platform-badge";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AnalyticsPeriod } from "@/lib/services/analytics";
import { cn } from "@/lib/utils";

// Mirrors ANALYTICS_PERIODS; kept local so this client bundle never imports the Prisma-backed service.
const PERIODS: readonly AnalyticsPeriod[] = [7, 30, 90];
const DEFAULT_PERIOD: AnalyticsPeriod = 7;
const ALL_CHANNELS = "all";

const PERIOD_OPTIONS: SegmentedOption<`${AnalyticsPeriod}`>[] = PERIODS.map((p) => ({ value: `${p}`, label: `${p}d` }));

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
    <div className={cn("flex w-full items-center gap-2 transition-opacity sm:w-auto", pending && "opacity-60")} aria-busy={pending || undefined}>
      {channels.length > 1 ? (
        <Select value={channelId ?? ALL_CHANNELS} onValueChange={(v) => navigate(days, v === ALL_CHANNELS ? null : v)}>
          <SelectTrigger className="min-w-0 flex-1 sm:w-[210px] sm:flex-none" aria-label="Account">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value={ALL_CHANNELS}>All accounts</SelectItem>
            {channels.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="flex items-center gap-2">
                  <PlatformMark platform={c.platform} size={16} />
                  {channelLabel(c)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Segmented
        aria-label="Period"
        value={`${days}`}
        onChange={(v) => navigate(PERIODS.find((p) => `${p}` === v) ?? DEFAULT_PERIOD, channelId)}
        options={PERIOD_OPTIONS}
        className="ml-auto w-auto shrink-0 tabular-nums sm:ml-0"
      />
    </div>
  );
}
