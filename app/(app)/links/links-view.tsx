"use client";

import * as React from "react";
import { ArrowUpRight, Link2, MoreHorizontal, MousePointerClick, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "@/components/ui/sonner";
import { Stat } from "@/components/ui/stat";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TrackedLinkListItem } from "@/lib/services/links";
import { cn, formatNumber } from "@/lib/utils";

import { errorMessage, linksApi } from "./api";
import { displayDestination, formatDate } from "./format";
import { LinkDetailDialog } from "./link-detail-dialog";
import { LinkFormDialog, type LinkFormMode } from "./link-form-dialog";
import { SourceBadge } from "./source-badge";

export interface LinksViewProps {
  initialItems: TrackedLinkListItem[];
  timezone: string;
}

function matches(link: TrackedLinkListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    link.slug.toLowerCase().includes(q) ||
    (link.label?.toLowerCase().includes(q) ?? false) ||
    link.destinationUrl.toLowerCase().includes(q) ||
    (link.automation?.name.toLowerCase().includes(q) ?? false) ||
    (link.broadcast?.name.toLowerCase().includes(q) ?? false)
  );
}

/** Keeps a click or key on an inner control from also opening the row. */
function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

/** Clicks in the last 7 days against the busiest link, so the hot ones stand out at a glance. */
function ClickBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <span aria-hidden className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-fog">
      <span className="block h-full origin-left animate-bar-grow rounded-full bg-purple" style={{ width: `${pct}%` }} />
    </span>
  );
}

/** Label on top when there is one; the short path is always there, with its copy button. */
function LinkName({ link }: { link: TrackedLinkListItem }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="min-w-0">
        {link.label ? (
          <p className="truncate font-semibold" title={link.label}>
            {link.label}
          </p>
        ) : null}
        <code className={cn("block truncate font-mono", link.label ? "text-[12px] text-muted-foreground" : "text-[13px] font-semibold text-ink")}>
          /l/{link.slug}
        </code>
      </div>
      <span onClick={stop} onKeyDown={stop}>
        <CopyButton value={link.shortUrl} variant="ghost" className="h-7 w-7" aria-label={`Copy ${link.shortUrl}`} successMessage="Short link copied" />
      </span>
    </div>
  );
}

function Destination({ url, className }: { url: string; className?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={stop}
      onKeyDown={stop}
      className={cn("inline-flex max-w-full items-center gap-1 text-muted-foreground outline-none hover:text-ink focus-visible:underline", className)}
      title={url}
    >
      <span className="truncate">{displayDestination(url)}</span>
      <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden />
    </a>
  );
}

function LinkActions({
  link,
  onOpen,
  onEdit,
  onDelete,
}: {
  link: TrackedLinkListItem;
  onOpen: (link: TrackedLinkListItem) => void;
  onEdit: (link: TrackedLinkListItem) => void;
  onDelete: (link: TrackedLinkListItem) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${link.label || link.slug}`} onClick={stop} onKeyDown={stop}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      {/* Menu events bubble through the portal to the row; stop them so a choice doesn't also open the row. */}
      <DropdownMenuContent align="end" onClick={stop} onKeyDown={stop}>
        <DropdownMenuItem onSelect={() => onOpen(link)}>
          <MousePointerClick />
          View clicks
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onEdit(link)}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={link.destinationUrl} target="_blank" rel="noreferrer">
            <ArrowUpRight />
            Open destination
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => onDelete(link)}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The list keeps its own copy of the rows: mutations patch it in place, so the page never flashes a full reload. */
export function LinksView({ initialItems, timezone }: LinksViewProps) {
  const [items, setItems] = React.useState<TrackedLinkListItem[]>(initialItems);
  const [query, setQuery] = React.useState("");
  const [formMode, setFormMode] = React.useState<LinkFormMode | null>(null);
  const [selected, setSelected] = React.useState<TrackedLinkListItem | null>(null);
  const [deleting, setDeleting] = React.useState<TrackedLinkListItem | null>(null);

  const visible = React.useMemo(() => items.filter((l) => matches(l, query)), [items, query]);
  const totals = React.useMemo(
    () => items.reduce((acc, l) => ({ clicks7d: acc.clicks7d + l.clicks7d, clicks: acc.clicks + l.clickCount }), { clicks7d: 0, clicks: 0 }),
    [items],
  );
  const busiest = React.useMemo(() => items.reduce((max, l) => Math.max(max, l.clicks7d), 0), [items]);

  function handleSaved(link: TrackedLinkListItem, mode: LinkFormMode["kind"]) {
    setItems((prev) => (mode === "create" ? [link, ...prev] : prev.map((l) => (l.id === link.id ? link : l))));
    if (selected?.id === link.id) setSelected(link);
  }

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    try {
      await linksApi.remove(target.id);
      setItems((prev) => prev.filter((l) => l.id !== target.id));
      if (selected?.id === target.id) setSelected(null);
      toast.success("Link deleted");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the link"));
      throw err;
    }
  }

  function openEdit(link: TrackedLinkListItem) {
    setSelected(null);
    setFormMode({ kind: "edit", link });
  }

  function openDelete(link: TrackedLinkListItem) {
    setSelected(null);
    setDeleting(link);
  }

  function openOnKey(e: React.KeyboardEvent, link: TrackedLinkListItem) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelected(link);
    }
  }

  const newLinkButton = (
    <Button onClick={() => setFormMode({ kind: "create" })}>
      <Plus />
      New link
    </Button>
  );

  return (
    <>
      <PageHeader title="Links" actions={items.length > 0 ? newLinkButton : null} />

      {items.length === 0 ? (
        <EmptyState icon={Link2} tone="sky" title="No links yet" description="Track taps on the links you send in DMs." action={newLinkButton} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat
              tone="sky"
              label="Clicks, last 7 days"
              value={formatNumber(totals.clicks7d)}
              className="rise col-span-2 lg:col-span-1"
            />
            <Stat label="Total clicks" value={formatNumber(totals.clicks)} className="rise [--i:1]" />
            <Stat label="Links" value={formatNumber(items.length)} className="rise [--i:2]" />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="relative w-full sm:w-72">
                <Label htmlFor="links-search" className="sr-only">
                  Search links
                </Label>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="links-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search links"
                  className="h-9 rounded-full pl-9 pr-9 text-[13px]"
                  autoComplete="off"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-fog hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {visible.length === items.length
                  ? `${formatNumber(items.length)} ${items.length === 1 ? "link" : "links"}`
                  : `${formatNumber(visible.length)} of ${formatNumber(items.length)} links`}
              </span>
            </div>

            {visible.length === 0 ? (
              <EmptyState
                icon={Search}
                tone="sky"
                compact
                title="No links match"
                description="Try another word from the label or address."
                action={
                  <Button type="button" variant="outline" size="sm" onClick={() => setQuery("")}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-5">Link</TableHead>
                        <TableHead>Destination</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">7 days</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="hidden lg:table-cell">Created</TableHead>
                        <TableHead className="w-12 pr-3">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((link, i) => (
                        <TableRow
                          key={link.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelected(link)}
                          onKeyDown={(e) => openOnKey(e, link)}
                          className="rise cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                          style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
                        >
                          <TableCell className="max-w-[280px] pl-5">
                            <LinkName link={link} />
                          </TableCell>
                          <TableCell className="max-w-[240px]">
                            <Destination url={link.destinationUrl} />
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            <SourceBadge link={link} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2.5">
                              <ClickBar value={link.clicks7d} max={busiest} />
                              <span className="min-w-8 font-semibold tabular-nums">{formatNumber(link.clicks7d)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(link.clickCount)}</TableCell>
                          <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">{formatDate(link.createdAt, timezone)}</TableCell>
                          <TableCell className="pr-3">
                            <LinkActions link={link} onOpen={setSelected} onEdit={openEdit} onDelete={openDelete} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Phones get one card per link instead of a table they would have to scroll sideways. */}
                <ul className="space-y-2 md:hidden">
                  {visible.map((link, i) => (
                    <li key={link.id} className="rise" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelected(link)}
                        onKeyDown={(e) => openOnKey(e, link)}
                        className="lift cursor-pointer rounded-2xl border bg-card p-4 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <LinkName link={link} />
                          </div>
                          <LinkActions link={link} onOpen={setSelected} onEdit={openEdit} onDelete={openDelete} />
                        </div>
                        <Destination url={link.destinationUrl} className="mt-1" />
                        <div className="mt-3 flex items-center gap-3">
                          <SourceBadge link={link} className="max-w-[50%]" />
                          <div className="ml-auto flex items-center gap-2 whitespace-nowrap">
                            <ClickBar value={link.clicks7d} max={busiest} />
                            <span>
                              <span className="font-semibold tabular-nums">{formatNumber(link.clicks7d)}</span>
                              <span className="text-muted-foreground"> in 7 days</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      <LinkFormDialog
        open={formMode !== null}
        mode={formMode ?? { kind: "create" }}
        onOpenChange={(open) => {
          if (!open) setFormMode(null);
        }}
        onSaved={handleSaved}
      />

      <LinkDetailDialog
        link={selected}
        timezone={timezone}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onEdit={openEdit}
        onDelete={openDelete}
      />

      <ConfirmDialog
        trigger={null}
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this link?"
        description={
          deleting
            ? `${deleting.shortUrl} stops working, including in messages you've already sent. Its ${formatNumber(deleting.clickCount)} recorded clicks are deleted too.`
            : undefined
        }
        confirmLabel="Delete link"
        destructive
        onConfirm={confirmDelete}
      />
    </>
  );
}
