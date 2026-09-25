"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, ChevronDown } from "lucide-react";

import { PlatformMark } from "@/components/ui/platform-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { historyLabel } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

export type FilterChannel = {
  id: string;
  platform: "INSTAGRAM" | "FACEBOOK";
  label: string;
};
export type FilterAutomation = { id: string; name: string; channelId: string };

const PRESETS = [
  { days: "7", label: "Last 7 days" },
  { days: "30", label: "Last 30 days" },
  { days: "90", label: "Last 90 days" },
] as const;

const ALL = "all";

/** One pill on the date track: ink when chosen, as every segmented control is. */
const RANGE_PILL =
  "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring sm:px-3.5";
const RANGE_PILL_ON = "bg-ink text-white";
const RANGE_PILL_OFF = "text-muted-foreground hover:bg-background hover:text-ink";

const PendingContext = React.createContext(false);

/**
 * One filter row above the report. Changing a filter swaps the URL; the server
 * re-renders the report while the current one stays on screen, dimmed, so the
 * layout never jumps.
 */
export function AnalyticsFrame({
  channels,
  automations,
  rangeLabel,
  today,
  earliest,
  historyDays,
  children,
  actions,
}: {
  /** Omit (or pass one) to hide the account filter. */
  channels?: FilterChannel[];
  /** Omit to hide the automation filter, e.g. on a single automation's report. */
  automations?: FilterAutomation[];
  /** e.g. "Aug 15 – Sep 13", on the custom range pill once one is chosen. */
  rangeLabel: string;
  /** YYYY-MM-DD in the workspace time zone; the latest selectable day. */
  today: string;
  /** YYYY-MM-DD; the earliest selectable day, where the plan's history begins. */
  earliest: string;
  /** Days of history the plan keeps: presets longer than this are left out. */
  historyDays: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const days = params.get("days");
  const from = params.get("from");
  const to = params.get("to");
  const custom = Boolean(from && to);
  const activePreset = custom ? null : (days ?? "30");
  const channelId = params.get("channelId") ?? ALL;
  const automationId = params.get("automationId") ?? ALL;

  const [customOpen, setCustomOpen] = React.useState(false);
  const [draftFrom, setDraftFrom] = React.useState(from ?? "");
  const [draftTo, setDraftTo] = React.useState(to ?? today);

  function push(update: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(update)) {
      if (value === null || value === ALL) next.delete(key);
      else next.set(key, value);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  const visibleAutomations = !automations ? [] : channelId === ALL ? automations : automations.filter((a) => a.channelId === channelId);

  return (
    <PendingContext.Provider value={pending}>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="scrollbar-none inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-fog p-1" role="group" aria-label="Date range">
            {PRESETS.filter((preset) => Number(preset.days) <= historyDays).map((preset) => (
              <button
                key={preset.days}
                type="button"
                onClick={() =>
                  push({
                    days: preset.days === "30" ? null : preset.days,
                    from: null,
                    to: null,
                  })
                }
                aria-pressed={activePreset === preset.days}
                aria-label={preset.label}
                className={cn(RANGE_PILL, activePreset === preset.days ? RANGE_PILL_ON : RANGE_PILL_OFF)}
              >
                {/* All four choices fit a phone's width only in the short form. */}
                <span className="sm:hidden">{preset.days}d</span>
                <span className="hidden sm:inline">{preset.label.replace("Last ", "")}</span>
              </button>
            ))}
            <Popover open={customOpen} onOpenChange={setCustomOpen}>
              <PopoverTrigger asChild>
                <button type="button" aria-pressed={custom} className={cn(RANGE_PILL, custom ? RANGE_PILL_ON : RANGE_PILL_OFF)}>
                  <CalendarRange className="hidden h-3.5 w-3.5 sm:block" aria-hidden />
                  {custom ? rangeLabel : "Custom"}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!draftFrom || !draftTo) return;
                    const [a, b] = draftFrom <= draftTo ? [draftFrom, draftTo] : [draftTo, draftFrom];
                    push({ from: a, to: b, days: null });
                    setCustomOpen(false);
                  }}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="range-from">From</Label>
                      <Input id="range-from" type="date" value={draftFrom} min={earliest} max={today} onChange={(e) => setDraftFrom(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="range-to">To</Label>
                      <Input id="range-to" type="date" value={draftTo} min={earliest} max={today} onChange={(e) => setDraftTo(e.target.value)} required />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Your plan keeps {historyLabel(historyDays)} of history.</p>
                  <Button type="submit" size="sm" className="w-full">
                    Apply range
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
          </div>

          {channels && channels.length > 1 ? (
            <Select value={channelId} onValueChange={(v) => push({ channelId: v, automationId: null })}>
              <SelectTrigger className="min-w-0 grow basis-40 gap-2 sm:w-auto sm:min-w-[170px] sm:grow-0 sm:basis-auto" aria-label="Account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All accounts</SelectItem>
                {(channels ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <PlatformMark platform={c.platform} size={16} />
                      {c.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          {automations ? (
            <Select value={automationId} onValueChange={(v) => push({ automationId: v })}>
              <SelectTrigger className="min-w-0 grow basis-40 gap-2 sm:w-auto sm:min-w-[180px] sm:max-w-[260px] sm:grow-0 sm:basis-auto" aria-label="Automation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All automations</SelectItem>
                {visibleAutomations.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <span className="sr-only" aria-live="polite">
            {pending ? "Updating" : ""}
          </span>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>

      <div className={cn("transition-opacity duration-150", pending && "pointer-events-none opacity-60")} aria-busy={pending}>
        {children}
      </div>
    </PendingContext.Provider>
  );
}
