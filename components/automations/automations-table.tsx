"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AutomationStatus } from "@prisma/client";
import { formatDistanceToNowStrict } from "date-fns";
import { BarChart3, Copy, ListFilter, MoreHorizontal, Pencil, Plus, Search, Trash2, Workflow } from "lucide-react";

import { AutomationStatusBadge, TriggerBadge } from "@/components/automations/badges";
import { apiFetch, errorMessage } from "@/components/automations/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AutomationDetail, AutomationListItem, ChannelOption } from "@/lib/services/automations";
import type { TemplateSummary } from "@/lib/services/templates";
import { cn, formatNumber, initials } from "@/lib/utils";

export type AutomationsTableProps = {
  automations: AutomationListItem[];
  channels: ChannelOption[];
  templates: TemplateSummary[];
  filters: { q: string; channelId: string; status: string };
  /** Whether the workspace has any automation at all (unfiltered). */
  hasAny: boolean;
};

const ALL_STATUSES = "ALL";
const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: ALL_STATUSES, label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "DRAFT", label: "Draft" },
];

const ALL_CHANNELS = "__all__";

function ChannelCell({ channel }: { channel: ChannelOption }) {
  const label = channel.username ? `@${channel.username}` : (channel.name ?? "Unnamed");
  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-6 w-6">
        {channel.avatarUrl ? <AvatarImage src={channel.avatarUrl} alt="" /> : null}
        <AvatarFallback className="text-[10px]">{initials(channel.username ?? channel.name)}</AvatarFallback>
      </Avatar>
      <span className="truncate text-[13px]">{label}</span>
      <PlatformIcon platform={channel.platform} size={12} className="text-muted-foreground" />
    </div>
  );
}

function KeywordChips({ keywords, matchMode }: { keywords: string[]; matchMode: AutomationListItem["matchMode"] }) {
  if (matchMode === "ANY") return <span className="text-[12px] text-muted-foreground">Any comment</span>;
  if (keywords.length === 0) return <span className="text-[12px] text-muted-foreground">No keywords</span>;
  const shown = keywords.slice(0, 3);
  const rest = keywords.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((k) => (
        <span key={k} className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium">
          {k}
        </span>
      ))}
      {rest > 0 ? <span className="text-[11px] text-muted-foreground">+{rest}</span> : null}
    </div>
  );
}

export function AutomationsTable({ automations, channels, templates, filters, hasAny }: AutomationsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = React.useTransition();

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
      toast.success(next === "ACTIVE" ? `“${item.name}” is live` : `“${item.name}” paused`);
      router.refresh();
    } catch (err) {
      setStatusOverride((s) => ({ ...s, [item.id]: item.status }));
      toast.error(errorMessage(err, "Couldn't change status"));
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
      toast.error(errorMessage(err, "Couldn't duplicate"));
    }
  }

  async function remove(item: AutomationListItem) {
    try {
      await apiFetch(`/api/automations/${item.id}`, { method: "DELETE" });
      toast.success(`Deleted “${item.name}”`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete"));
      throw err;
    }
  }

  const isFiltered = Boolean(filters.q || filters.channelId || filters.status);

  if (!hasAny) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={Workflow}
          title="Create your first automation"
          description="Turn comments, DMs and story replies into instant conversations. Start from a template or build a flow from scratch."
          action={
            <Button asChild>
              <Link href="/automations/new">
                <Plus /> New automation
              </Link>
            </Button>
          }
        />
        <div>
          <p className="mb-3 text-sm font-medium">Start from a template</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <Link
                key={t.id}
                href={`/automations/new?template=${encodeURIComponent(t.id)}`}
                className="group rounded-lg border bg-card p-4 shadow-card transition-colors hover:border-foreground/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{t.name}</p>
                  <TriggerBadge trigger={t.triggerType} />
                </div>
                <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{t.description}</p>
                <p className="mt-3 truncate text-[11px] text-muted-foreground">{t.steps.map((s) => s.label).join(" → ")}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or keyword"
            aria-label="Search automations"
            className="pl-8"
          />
        </div>
        <Select value={filters.channelId || ALL_CHANNELS} onValueChange={(v) => setParam("channel", v === ALL_CHANNELS ? "" : v)}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filter by channel">
            <SelectValue placeholder="All channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CHANNELS}>All channels</SelectItem>
            {channels.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.username ? `@${c.username}` : (c.name ?? "Unnamed")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tabs value={filters.status || ALL_STATUSES} onValueChange={(v) => setParam("status", v === ALL_STATUSES ? "" : v)} className="sm:ml-auto">
          <TabsList>
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {automations.length === 0 ? (
        <EmptyState
          icon={ListFilter}
          title="No automations match"
          description="Try a different search, channel or status."
          action={
            isFiltered ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  startTransition(() => router.replace(pathname, { scroll: false }));
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-[220px]">Name</TableHead>
                <TableHead className="min-w-[160px]">Channel</TableHead>
                <TableHead className="min-w-[160px]">Keywords</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[90px] text-right">Sent 7d</TableHead>
                <TableHead className="w-[140px]">Last triggered</TableHead>
                <TableHead className="w-[56px]">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {automations.map((item) => {
                const status = statusOverride[item.id] ?? item.status;
                const isDraft = status === "DRAFT";
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex min-w-0 flex-col gap-1">
                        <Link href={`/automations/${item.id}`} className="truncate font-medium hover:underline underline-offset-2">
                          {item.name}
                        </Link>
                        <div>
                          <TriggerBadge trigger={item.triggerType} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ChannelCell channel={item.channel} />
                    </TableCell>
                    <TableCell>
                      <KeywordChips keywords={item.keywords} matchMode={item.matchMode} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isDraft ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={0} className="inline-flex">
                                <Switch checked={false} disabled aria-label="Draft automations are activated from the builder" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Open the builder to finish and activate this draft</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Switch
                            checked={status === "ACTIVE"}
                            disabled={busyId === item.id}
                            onCheckedChange={(on) => toggleStatus(item, on)}
                            aria-label={status === "ACTIVE" ? "Pause automation" : "Activate automation"}
                          />
                        )}
                        <AutomationStatusBadge status={status} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(item.sent7d)}</TableCell>
                    <TableCell className={cn("text-[12px]", !item.lastTriggeredAt && "text-muted-foreground")}>
                      {item.lastTriggeredAt ? formatDistanceToNowStrict(new Date(item.lastTriggeredAt), { addSuffix: true }) : "Never"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${item.name}`}>
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
        </div>
      )}

      <ConfirmDialog
        trigger={null}
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={deleteTarget ? `Delete “${deleteTarget.name}”?` : "Delete automation?"}
        description="Active conversations started by this automation will stop. Delivery history is kept in Logs."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (deleteTarget) await remove(deleteTarget);
        }}
      />
    </div>
  );
}
