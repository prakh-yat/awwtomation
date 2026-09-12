"use client";

import Link from "next/link";
import * as React from "react";
import { ExternalLink, Link2, MoreHorizontal, MousePointerClick, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/ui/copy-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "@/components/ui/sonner";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TrackedLinkListItem } from "@/lib/services/links";
import { formatNumber } from "@/lib/utils";

import { errorMessage, linksApi } from "./api";
import { displayDestination, formatDate } from "./format";
import { LinkDetailDialog } from "./link-detail-dialog";
import { LinkFormDialog, type LinkFormMode } from "./link-form-dialog";

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

function SourceCell({ link }: { link: TrackedLinkListItem }) {
  if (link.automation) {
    return (
      <Link
        href={`/automations/${link.automation.id}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex max-w-full items-center"
        title={`Automation · ${link.automation.name}`}
      >
        <Badge variant="outline" className="max-w-[180px]">
          <span className="truncate">{link.automation.name}</span>
        </Badge>
      </Link>
    );
  }
  if (link.broadcast) {
    return (
      <Link
        href={`/broadcasts/${link.broadcast.id}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex max-w-full items-center"
        title={`Broadcast · ${link.broadcast.name}`}
      >
        <Badge variant="outline" className="max-w-[180px]">
          <span className="truncate">{link.broadcast.name}</span>
        </Badge>
      </Link>
    );
  }
  return <Badge variant="secondary">Manual</Badge>;
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

  const newLinkButton = (
    <Button size="sm" onClick={() => setFormMode({ kind: "create" })}>
      <Plus />
      New link
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Tracked links"
        description="Short links that count every tap from your DMs, with per-link click history."
        actions={newLinkButton}
      />

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Links" value={formatNumber(items.length)} icon={Link2} />
          <StatCard label="Clicks · last 7 days" value={formatNumber(totals.clicks7d)} icon={MousePointerClick} />
          <StatCard label="Clicks · all time" value={formatNumber(totals.clicks)} hint="Link previews from Meta's crawlers are not counted" />
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={Link2}
            title="No tracked links yet"
            description="Create a short link, put it in a message button and see exactly how many people tap it — and who."
            action={newLinkButton}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
                <Label htmlFor="links-search" className="sr-only">
                  Search links
                </Label>
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="links-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search label, destination or slug"
                  className="h-8 pl-8 text-[13px]"
                  autoComplete="off"
                />
              </div>
              {query ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setQuery("")}>
                  <X />
                  Clear
                </Button>
              ) : null}
              <span className="ml-auto text-xs text-muted-foreground">
                {visible.length === items.length ? `${formatNumber(items.length)} links` : `${formatNumber(visible.length)} of ${formatNumber(items.length)} links`}
              </span>
            </div>

            {visible.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No links match"
                description="Try a different label, destination or slug."
                action={
                  <Button type="button" variant="outline" size="sm" onClick={() => setQuery("")}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <div className="rounded-lg border bg-card shadow-card">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Short URL</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">7 days</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-10">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((link) => (
                      <TableRow
                        key={link.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelected(link)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelected(link);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <code className="font-mono text-xs">/l/{link.slug}</code>
                            <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                              <CopyButton value={link.shortUrl} variant="ghost" className="h-7 w-7" successMessage="Short link copied" />
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          {link.label ? (
                            <span className="block truncate font-medium" title={link.label}>
                              {link.label}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          <a
                            href={link.destinationUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex max-w-full items-center gap-1 text-muted-foreground hover:text-foreground"
                            title={link.destinationUrl}
                          >
                            <span className="truncate">{displayDestination(link.destinationUrl)}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </TableCell>
                        <TableCell>
                          <SourceCell link={link} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(link.clicks7d)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(link.clickCount)}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(link.createdAt, timezone)}</TableCell>
                        <TableCell className="pr-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label={`Actions for ${link.label || link.slug}`}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onSelect={() => setSelected(link)}>
                                <MousePointerClick />
                                View clicks
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openEdit(link)}>
                                <Pencil />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <a href={link.destinationUrl} target="_blank" rel="noreferrer">
                                  <ExternalLink />
                                  Open destination
                                </a>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem destructive onSelect={() => openDelete(link)}>
                                <Trash2 />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>

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
            ? `${deleting.shortUrl} will stop working immediately — anyone who taps it from an old message will see an error. Its ${formatNumber(deleting.clickCount)} recorded clicks are removed too.`
            : undefined
        }
        confirmLabel="Delete link"
        destructive
        onConfirm={confirmDelete}
      />
    </>
  );
}
