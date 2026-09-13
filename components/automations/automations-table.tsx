"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AutomationStatus, TriggerType } from "@prisma/client";
import { formatDistanceToNowStrict } from "date-fns";
import { BarChart3, Copy, MessageCircle, MessageSquare, MoreHorizontal, Pencil, Search, Sparkles, Trash2 } from "lucide-react";

import { apiFetch, errorMessage } from "@/components/automations/api";
import { TriggerBadge } from "@/components/automations/badges";
import { NewAutomationButton } from "@/components/automations/new-automation-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AutomationDetail, AutomationListItem, ChannelOption } from "@/lib/services/automations";
import type { TemplateSummary } from "@/lib/services/templates";
import { cn, formatNumber } from "@/lib/utils";

export type AutomationsTableProps = {
  automations: AutomationListItem[];
  channels: ChannelOption[];
  templates: TemplateSummary[];
  filters: { q: string; channelId: string; status: string };
  /** Per-status totals for the tabs (within the channel filter, ignoring search). */
  statusCounts: Record<AutomationStatus, number>;
  /** Whether the workspace has any automation at all, whatever the filters. */
  hasAny: boolean;
  /** Account a blank automation starts on; null when none is connected. */
  firstActiveChannelId: string | null;
};

const STATUS_TABS: Array<{ value: "" | AutomationStatus; label: string }> = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "DRAFT", label: "Drafts" },
];

const ALL_CHANNELS = "__all__";

const TRIGGER_ICON: Record<TriggerType, typeof MessageSquare> = {
  COMMENT: MessageSquare,
  DM: MessageCircle,
  STORY_REPLY: Sparkles,
};

function handle(channel: Pick<ChannelOption, "username" | "name" | "platform">): string {
  if (channel.username) return `@${channel.username.replace(/^@/, "")}`;
  return channel.name ?? (channel.platform === "INSTAGRAM" ? "Instagram account" : "Facebook Page");
}

/** "Comment on any post", "Any DM", "Story reply" — what starts the automation, in words. */
function triggerText(item: AutomationListItem): string {
  const any = item.matchMode === "ANY";
  const posts = item.postCount === 1 ? "1 post" : `${item.postCount} posts`;
  switch (item.triggerType) {
    case "COMMENT":
      if (item.postCount > 0) return any ? `Any comment on ${posts}` : `Comment on ${posts}`;
      return any ? "Any comment" : "Comment on any post";
    case "DM":
      return any ? "Any DM" : "DM";
    case "STORY_REPLY":
      return any ? "Any story reply" : "Story reply";
  }
}

function TriggerLine({ item }: { item: AutomationListItem }) {
  const Icon = TRIGGER_ICON[item.triggerType];
  const keywords = item.matchMode === "ANY" ? [] : item.keywords;
  const shown = keywords.slice(0, 3);
  const extra = keywords.length - shown.length;
  return (
    <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="shrink-0">{triggerText(item)}</span>
      {shown.length > 0 ? (
        <>
          <span aria-hidden>·</span>
          <span className="truncate">
            {shown.map((k, i) => (
              <React.Fragment key={k}>
                {i > 0 ? ", " : null}
                <span className="text-foreground/80">{k}</span>
              </React.Fragment>
            ))}
            {extra > 0 ? ` +${extra}` : null}
          </span>
        </>
      ) : null}
    </span>
  );
}

export function AutomationsTable({ automations, channels, templates, filters, statusCounts, hasAny, firstActiveChannelId }: AutomationsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const [search, setSearch] = React.useState(filters.q);
  // Optimistic status per row so the switch flips instantly; cleared on refresh.
  const [statusOverride, setStatusOverride] = React.useState<Record<string, AutomationStatus>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<AutomationListItem | null>(null);

  const setParam = React.useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const qs = next.toString();
      // A transition keeps the current table on screen while the server re-renders.
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  React.useEffect(() => {
    if (search === filters.q) return;
    const t = setTimeout(() => setParam("q", search.trim()), 300);
    return () => clearTimeout(t);
  }, [search, filters.q, setParam]);

  React.useEffect(() => {
    // Server data caught up with the optimistic state — drop the overrides.
    setStatusOverride({});
  }, [automations]);

  async function toggleStatus(item: AutomationListItem, on: boolean) {
    const next: AutomationStatus = on ? "ACTIVE" : "PAUSED";
    setStatusOverride((s) => ({ ...s, [item.id]: next }));
    setBusyId(item.id);
    try {
      await apiFetch<{ automation: AutomationDetail }>(`/api/automations/${item.id}/status`, { method: "POST", json: { status: next } });
      toast.success(next === "ACTIVE" ? `“${item.name}” is on` : `“${item.name}” is paused`);
      router.refresh();
    } catch (err) {
      setStatusOverride((s) => ({ ...s, [item.id]: item.status }));
      toast.error(errorMessage(err, "Couldn't change the status"));
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(item: AutomationListItem) {
    try {
      const { automation } = await apiFetch<{ automation: AutomationDetail }>(`/api/automations/${item.id}/duplicate`, { method: "POST" });
      toast.success(`Duplicated as “${automation.name}”`, {
        action: { label: "Open", onClick: () => router.push(`/automations/${automation.id}`) },
      });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't duplicate it"));
    }
  }

  async function remove(item: AutomationListItem) {
    try {
      await apiFetch(`/api/automations/${item.id}`, { method: "DELETE" });
      toast.success(`Deleted “${item.name}”`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete it"));
      throw err;
    }
  }

  const total = statusCounts.ACTIVE + statusCounts.PAUSED + statusCounts.DRAFT;
  const isFiltered = Boolean(filters.q || filters.channelId || filters.status);
  const showAccount = channels.length > 1;
  const activeTab = STATUS_TABS.some((t) => t.value === filters.status) ? filters.status : "";

  if (!hasAny) {
    return (
      <div className="space-y-8">
        <div className="rounded-lg border bg-card px-6 py-10 text-center shadow-card">
          <h2 className="text-base font-semibold tracking-tight">No automations yet</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
            An automation replies for you when someone comments a keyword, sends a DM or answers your story. Start from a template below or build one yourself.
          </p>
          <NewAutomationButton channelId={firstActiveChannelId} label="Start from scratch" className="mt-5" />
        </div>

        {templates.length > 0 ? (
          <section aria-labelledby="templates-heading">
            <h2 id="templates-heading" className="mb-3 text-sm font-medium">
              Templates
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {templates.map((t) => (
                <Link
                  key={t.id}
                  href={`/automations/templates?template=${encodeURIComponent(t.id)}`}
                  className="group flex flex-col rounded-lg border bg-card p-4 shadow-card outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{t.name}</p>
                    <TriggerBadge trigger={t.triggerType} className="shrink-0" />
                  </div>
                  <p className="mt-1.5 line-clamp-3 text-[13px] text-muted-foreground">{t.description}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4 transition-opacity", pending && "opacity-70")} aria-busy={pending || undefined}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or keyword"
              aria-label="Search automations"
              className="pl-8"
            />
          </div>
          {showAccount ? (
            <Select value={filters.channelId || ALL_CHANNELS} onValueChange={(v) => setParam("channel", v === ALL_CHANNELS ? "" : v)}>
              <SelectTrigger className="w-full sm:w-56" aria-label="Filter by account">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CHANNELS}>All accounts</SelectItem>
                {channels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <PlatformIcon platform={c.platform} size={13} className="text-muted-foreground" />
                      {handle(c)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        <div role="tablist" aria-label="Status" className="inline-flex h-9 w-fit items-center rounded-lg bg-muted p-1">
          {STATUS_TABS.map((t) => {
            const selected = activeTab === t.value;
            const count = t.value === "" ? total : statusCounts[t.value];
            return (
              <button
                key={t.label}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setParam("status", t.value)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                <span className={cn("tabular-nums", selected ? "text-muted-foreground" : "text-muted-foreground/70")}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {automations.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-12 text-center">
          <p className="text-sm font-medium">No automations match</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Try another search{showAccount ? ", account" : ""} or status.</p>
          {isFiltered ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setSearch("");
                startTransition(() => router.replace(pathname, { scroll: false }));
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 md:min-w-[260px]">Automation</TableHead>
                {showAccount ? <TableHead className="hidden min-w-[170px] lg:table-cell">Account</TableHead> : null}
                <TableHead className="hidden w-[100px] text-right sm:table-cell">DMs sent</TableHead>
                <TableHead className="hidden w-[100px] text-right md:table-cell">Link clicks</TableHead>
                <TableHead className="hidden w-[150px] pl-6 lg:table-cell">Last run</TableHead>
                <TableHead className="w-[90px]">Status</TableHead>
                <TableHead className="w-[52px] pr-3">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {automations.map((item) => {
                const status = statusOverride[item.id] ?? item.status;
                return (
                  <TableRow key={item.id} className="group">
                    <TableCell className="max-w-[200px] py-3 pl-5 sm:max-w-[420px]">
                      <Link href={`/automations/${item.id}`} className="block truncate font-medium underline-offset-4 hover:underline">
                        {item.name}
                      </Link>
                      <TriggerLine item={item} />
                    </TableCell>
                    {showAccount ? (
                      <TableCell className="hidden lg:table-cell">
                        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                          <PlatformIcon platform={item.channel.platform} size={13} className="shrink-0" />
                          <span className="truncate">{handle(item.channel)}</span>
                        </span>
                      </TableCell>
                    ) : null}
                    <TableCell className={cn("hidden text-right tabular-nums sm:table-cell", item.sent7d === 0 && "text-muted-foreground")}>{formatNumber(item.sent7d)}</TableCell>
                    <TableCell className={cn("hidden text-right tabular-nums md:table-cell", item.clicks7d === 0 && "text-muted-foreground")}>
                      {formatNumber(item.clicks7d)}
                    </TableCell>
                    <TableCell className="hidden pl-6 text-muted-foreground lg:table-cell">
                      {item.lastTriggeredAt ? formatDistanceToNowStrict(new Date(item.lastTriggeredAt), { addSuffix: true }) : "Never"}
                    </TableCell>
                    <TableCell>
                      {status === "DRAFT" ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link href={`/automations/${item.id}`} className="inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              <Badge variant="secondary">Draft</Badge>
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent>Finish it in the builder to turn it on</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Switch
                          checked={status === "ACTIVE"}
                          disabled={busyId === item.id}
                          onCheckedChange={(on) => toggleStatus(item, on)}
                          aria-label={status === "ACTIVE" ? `Pause ${item.name}` : `Turn on ${item.name}`}
                          title={status === "ACTIVE" ? "On" : "Paused"}
                        />
                      )}
                    </TableCell>
                    <TableCell className="pr-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label={`Actions for ${item.name}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem asChild>
                            <Link href={`/automations/${item.id}`}>
                              <Pencil /> Edit
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/automations/${item.id}/analytics`}>
                              <BarChart3 /> Analytics
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => duplicate(item)}>
                            <Copy /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onSelect={() => setDeleteTarget(item)}>
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="border-t bg-muted/30 px-5 py-2.5 text-xs text-muted-foreground">DMs sent and link clicks cover the last 7 days.</p>
        </div>
      )}

      <ConfirmDialog
        trigger={null}
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={deleteTarget ? `Delete “${deleteTarget.name}”?` : "Delete automation?"}
        description="It stops replying straight away, including in conversations it already started. Its past messages stay in Logs."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (deleteTarget) await remove(deleteTarget);
        }}
      />
    </div>
  );
}
