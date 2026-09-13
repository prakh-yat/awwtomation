"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, ChevronDown } from "lucide-react";

import { PlatformIcon } from "@/components/ui/platform-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  compareLabel,
  today,
  children,
  actions,
}: {
  /** Omit (or pass one) to hide the account filter. */
  channels?: FilterChannel[];
  /** Omit to hide the automation filter, e.g. on a single automation's report. */
  automations?: FilterAutomation[];
  /** e.g. "Aug 15 – Sep 13" */
  rangeLabel: string;
  /** e.g. "vs Jul 16 – Aug 14", shown once for every change figure below. */
  compareLabel: string;
  /** YYYY-MM-DD in the workspace time zone; the latest selectable day. */
  today: string;
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
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="group" aria-label="Date range">
            {PRESETS.map((preset) => (
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
                className={cn(
                  "h-8 rounded-md px-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  activePreset === preset.days
                    ? "bg-background font-medium text-foreground shadow-card"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {preset.label.replace("Last ", "")}
              </button>
            ))}
            <Popover open={customOpen} onOpenChange={setCustomOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-pressed={custom}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    custom ? "bg-background font-medium text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <CalendarRange className="h-3.5 w-3.5" />
                  {custom ? rangeLabel : "Custom"}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
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
                      <Input id="range-from" type="date" value={draftFrom} max={today} onChange={(e) => setDraftFrom(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="range-to">To</Label>
                      <Input id="range-to" type="date" value={draftTo} max={today} onChange={(e) => setDraftTo(e.target.value)} required />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Up to a year. Compared with the same number of days before it.</p>
                  <Button type="submit" size="sm" className="w-full">
                    Apply range
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
          </div>

          {channels && channels.length > 1 ? (
            <Select value={channelId} onValueChange={(v) => push({ channelId: v, automationId: null })}>
              <SelectTrigger className="h-9 w-auto min-w-[160px] gap-2" aria-label="Account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All accounts</SelectItem>
                {(channels ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <PlatformIcon platform={c.platform} size={13} className="text-muted-foreground" />
                      {c.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          {automations ? (
            <Select value={automationId} onValueChange={(v) => push({ automationId: v })}>
              <SelectTrigger className="h-9 w-auto min-w-[180px] max-w-[260px] gap-2" aria-label="Automation">
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

          <span className="text-xs text-muted-foreground">{pending ? "Updating…" : `Changes ${compareLabel}`}</span>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>

      <div className={cn("transition-opacity duration-150", pending && "pointer-events-none opacity-60")} aria-busy={pending}>
        {children}
      </div>
    </PendingContext.Provider>
  );
}
