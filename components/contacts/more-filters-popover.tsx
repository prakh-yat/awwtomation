"use client";

import * as React from "react";
import type { ChannelPlatform } from "@prisma/client";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ContactChannelSummary, ContactTagCount } from "@/lib/services/contacts";
import { cn } from "@/lib/utils";

import { type ContactFilterState, LAST_INTERACTION_OPTIONS } from "./filters";
import { TagInput } from "./tag-input";

const ALL = "all";

function accountLabel(c: Pick<ContactChannelSummary, "username" | "name" | "platform">): string {
  if (c.username) return `@${c.username.replace(/^@/, "")}`;
  return c.name ?? (c.platform === "INSTAGRAM" ? "Instagram account" : "Facebook Page");
}

/** How many of the filters inside this popover are set, for the button badge. */
export function moreFiltersCount(f: ContactFilterState): number {
  return [f.channelId, f.platform, f.follower !== "all", f.lastInteractionDays, f.source, f.excludeTags.length > 0, f.excludeOptedOut].filter(Boolean).length;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3">
      <Label htmlFor={htmlFor} className="text-[13px] font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function MoreFiltersPopover({
  filters,
  onChange,
  channels,
  tags,
}: {
  filters: ContactFilterState;
  onChange: (next: Partial<ContactFilterState>) => void;
  channels: ContactChannelSummary[];
  tags: ContactTagCount[];
}) {
  const count = moreFiltersCount(filters);
  const platforms = new Set(channels.map((c) => c.platform));
  const customDays = filters.lastInteractionDays && !LAST_INTERACTION_OPTIONS.some((o) => o.days === filters.lastInteractionDays) ? filters.lastInteractionDays : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-1.5", count > 0 && "border-foreground")}>
          <SlidersHorizontal />
          Filters
          {count > 0 ? (
            <Badge variant="default" className="ml-0.5 h-4 min-w-4 justify-center px-1 tabular-nums">
              {count}
            </Badge>
          ) : null}
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] space-y-3 p-4">
        {channels.length > 1 ? (
          <Field label="Account" htmlFor="filter-account">
            <Select value={filters.channelId || ALL} onValueChange={(v) => onChange({ channelId: v === ALL ? "" : v })}>
              <SelectTrigger id="filter-account" className="h-8 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All accounts</SelectItem>
                {channels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="inline-flex items-center gap-1.5">
                      <PlatformIcon platform={c.platform} size={12} />
                      {accountLabel(c)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        {platforms.size > 1 || filters.platform ? (
          <Field label="Platform" htmlFor="filter-platform">
            <Select value={filters.platform || ALL} onValueChange={(v) => onChange({ platform: v === ALL ? "" : (v as ChannelPlatform) })}>
              <SelectTrigger id="filter-platform" className="h-8 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Instagram and Facebook</SelectItem>
                <SelectItem value="INSTAGRAM">Instagram</SelectItem>
                <SelectItem value="FACEBOOK">Facebook</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        <Field label="Follows you" htmlFor="filter-follower">
          <Select value={filters.follower} onValueChange={(v) => onChange({ follower: v === "yes" ? "yes" : v === "no" ? "no" : "all" })}>
            <SelectTrigger id="filter-follower" className="h-8 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Anyone</SelectItem>
              <SelectItem value="yes">Followers</SelectItem>
              <SelectItem value="no">Not following</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Last activity" htmlFor="filter-activity">
          <Select value={filters.lastInteractionDays ? String(filters.lastInteractionDays) : ALL} onValueChange={(v) => onChange({ lastInteractionDays: v === ALL ? null : Number(v) })}>
            <SelectTrigger id="filter-activity" className="h-8 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any time</SelectItem>
              {LAST_INTERACTION_OPTIONS.map((o) => (
                <SelectItem key={o.days} value={String(o.days)}>
                  {o.label}
                </SelectItem>
              ))}
              {customDays ? <SelectItem value={String(customDays)}>Last {customDays} days</SelectItem> : null}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Added from" htmlFor="filter-source">
          <Select value={filters.source || ALL} onValueChange={(v) => onChange({ source: v === "WEBHOOK" || v === "IMPORT" || v === "MANUAL" ? v : "" })}>
            <SelectTrigger id="filter-source" className="h-8 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Anywhere</SelectItem>
              <SelectItem value="WEBHOOK">Comments and messages</SelectItem>
              <SelectItem value="MANUAL">Added by hand</SelectItem>
              <SelectItem value="IMPORT">Imported</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <div className="space-y-1.5">
          <Label htmlFor="filter-exclude-tags" className="text-[13px] font-normal text-muted-foreground">
            Without these tags
          </Label>
          <TagInput
            id="filter-exclude-tags"
            value={filters.excludeTags}
            onChange={(excludeTags) => onChange({ excludeTags })}
            suggestions={tags.map((t) => t.tag)}
            restrictToSuggestions
            placeholder="Pick tags"
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <Label htmlFor="filter-opted-out" className="text-[13px] font-normal">
            Hide people who stopped messages
          </Label>
          <Switch id="filter-opted-out" checked={filters.excludeOptedOut} onCheckedChange={(excludeOptedOut) => onChange({ excludeOptedOut })} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
