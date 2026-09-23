"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Inbox, MoreHorizontal, Trash2, UserRound, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ContactListItem } from "@/lib/services/contacts";
import type { PipelineStageSummary, PipelineSummary } from "@/lib/services/pipelines";
import { cn } from "@/lib/utils";

import { ContactAvatar } from "./contact-avatar";
import { OwnerAvatar, type OwnerOption, ownerLabel } from "./contact-details-card";
import { contactDisplayName, contactProfileUrl, formatAbsolute, formatRelative, platformLabel } from "./format";
import { PipelinesCell, StageSelectCell } from "./pipeline-controls";
import { riseStyle } from "./rise";
import { TagChips } from "./tag-chips";

const UNASSIGNED = "unassigned";

/** Compact in-row owner picker. */
function OwnerCell({ item, owners, onChange }: { item: ContactListItem; owners: OwnerOption[]; onChange: (ownerId: string | null) => void }) {
  const owner = owners.find((o) => o.id === item.ownerId) ?? item.owner;
  return (
    <Select value={item.ownerId ?? UNASSIGNED} onValueChange={(v) => onChange(v === UNASSIGNED ? null : v)}>
      <SelectTrigger
        className="h-8 w-auto max-w-[11rem] gap-1.5 rounded-full border-transparent bg-transparent px-2 text-[13px] hover:border-input hover:bg-background [&>svg]:h-3 [&>svg]:w-3"
        aria-label={`Owner for ${contactDisplayName(item)}`}
      >
        {/* A div, not a span: the trigger line-clamps direct span children, which would stack the avatar over the name. */}
        {owner ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <OwnerAvatar owner={owner} />
            <div className="truncate">{ownerLabel(owner)}</div>
          </div>
        ) : (
          <div className="text-muted-foreground">Unassigned</div>
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>
          <span className="text-muted-foreground">Unassigned</span>
        </SelectItem>
        {owners.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            <span className="flex items-center gap-2">
              <OwnerAvatar owner={o} />
              {ownerLabel(o)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Placeholder rows while the first page of a view loads. */
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i} className="hover:bg-transparent">
          <TableCell className="pl-4">
            <Skeleton className="h-[18px] w-[18px] rounded-md" />
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-24 rounded-full" />
          </TableCell>
          <TableCell className="hidden lg:table-cell">
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell className="hidden md:table-cell">
            <Skeleton className="h-5 w-16 rounded-full" />
          </TableCell>
          <TableCell className="hidden sm:table-cell">
            <Skeleton className="h-3.5 w-16" />
          </TableCell>
          <TableCell />
        </TableRow>
      ))}
    </>
  );
}

export interface ContactsTableProps {
  items: ContactListItem[];
  loading: boolean;
  selected: Set<string>;
  onToggleAll: (checked: boolean) => void;
  onToggleOne: (id: string, checked: boolean) => void;
  /** The pipeline being viewed: its stage becomes the second column. */
  pipeline: PipelineSummary | null;
  pipelines: PipelineSummary[];
  owners: OwnerOption[];
  timezone: string;
  onSetStage: (item: ContactListItem, pipeline: PipelineSummary, stage: PipelineStageSummary) => void;
  onRemoveFromPipeline: (item: ContactListItem, pipeline: PipelineSummary) => void;
  onChangeOwner: (item: ContactListItem, ownerId: string | null) => void;
  onDelete: (item: ContactListItem) => void;
  /** Pagination, under the last row. */
  footer?: React.ReactNode;
}

/**
 * One page of contacts. Owner, tags and last activity step out of the way on
 * narrow screens; the contact and their stage always stay.
 */
export function ContactsTable({
  items,
  loading,
  selected,
  onToggleAll,
  onToggleOne,
  pipeline,
  pipelines,
  owners,
  timezone,
  onSetStage,
  onRemoveFromPipeline,
  onChangeOwner,
  onDelete,
  footer,
}: ContactsTableProps) {
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-card transition-opacity duration-200", loading && items.length > 0 && "opacity-60")} aria-busy={loading}>
      <Table>
        <TableHeader className="bg-fog/60">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-11 pl-4">
              <Checkbox checked={allSelected ? true : someSelected ? "indeterminate" : false} onCheckedChange={(v) => onToggleAll(v === true)} aria-label="Select all on this page" />
            </TableHead>
            <TableHead className="min-w-[200px]">Contact</TableHead>
            <TableHead className="w-[190px]">{pipeline ? "Stage" : "Pipeline"}</TableHead>
            <TableHead className="hidden w-[180px] lg:table-cell">Owner</TableHead>
            <TableHead className="hidden w-[170px] md:table-cell">Tags</TableHead>
            <TableHead className="hidden w-[130px] sm:table-cell">Last activity</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => {
            const isSelected = selected.has(item.id);
            const name = contactDisplayName(item);
            const profileUrl = contactProfileUrl(item);
            const secondary = [item.username && item.name ? `@${item.username.replace(/^@/, "")}` : null, item.email].filter(Boolean).join(" · ");
            return (
              <TableRow key={item.id} data-state={isSelected ? "selected" : undefined} className="rise" style={riseStyle(index)}>
                <TableCell className="pl-4">
                  <Checkbox checked={isSelected} onCheckedChange={(v) => onToggleOne(item.id, v === true)} aria-label={`Select ${name}`} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <ContactAvatar name={item.name} username={item.username} avatarUrl={item.avatarUrl} platform={item.platform} size="sm" />
                    <div className="min-w-0 max-w-[16rem]">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/contacts/${item.id}`} className="truncate font-semibold text-ink underline-offset-4 hover:underline">
                          {name}
                        </Link>
                        {item.optedOut ? <Badge variant="warning">Stopped</Badge> : null}
                      </div>
                      {secondary ? <div className="truncate text-[12px] text-muted-foreground">{secondary}</div> : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {pipeline ? (
                    <StageSelectCell
                      pipeline={pipeline}
                      entry={item.pipelines.find((e) => e.pipelineId === pipeline.id)}
                      contactName={name}
                      onChange={(stageId) => {
                        const stage = pipeline.stages.find((s) => s.id === stageId);
                        if (stage) onSetStage(item, pipeline, stage);
                      }}
                    />
                  ) : (
                    <PipelinesCell
                      pipelines={pipelines}
                      entries={item.pipelines}
                      contactName={name}
                      onSetStage={(p, s) => onSetStage(item, p, s)}
                      onRemove={(p) => onRemoveFromPipeline(item, p)}
                    />
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <OwnerCell item={item} owners={owners} onChange={(ownerId) => onChangeOwner(item, ownerId)} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <TagChips tags={item.tags} max={1} className="flex-nowrap" />
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                  {item.lastInteractionAt ? (
                    <time dateTime={item.lastInteractionAt} title={formatAbsolute(item.lastInteractionAt, timezone)} suppressHydrationWarning>
                      {formatRelative(item.lastInteractionAt)}
                    </time>
                  ) : (
                    "–"
                  )}
                </TableCell>
                <TableCell className="pr-3 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" className="text-muted-foreground data-[state=open]:bg-fog data-[state=open]:text-ink" aria-label={`Actions for ${name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem asChild>
                        <Link href={`/contacts/${item.id}`}>
                          <UserRound />
                          Open contact
                        </Link>
                      </DropdownMenuItem>
                      {item.conversationId ? (
                        <DropdownMenuItem asChild>
                          <Link href={`/inbox?c=${encodeURIComponent(item.conversationId)}`}>
                            <Inbox />
                            Open conversation
                          </Link>
                        </DropdownMenuItem>
                      ) : null}
                      {profileUrl ? (
                        <DropdownMenuItem asChild>
                          <a href={profileUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink />
                            View on {platformLabel(item.platform)}
                          </a>
                        </DropdownMenuItem>
                      ) : null}
                      {pipeline && item.pipelines.some((e) => e.pipelineId === pipeline.id) ? (
                        <DropdownMenuItem onSelect={() => onRemoveFromPipeline(item, pipeline)}>
                          <X />
                          Remove from {pipeline.name}
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onSelect={() => onDelete(item)}>
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
          {items.length === 0 ? <SkeletonRows /> : null}
        </TableBody>
      </Table>

      {footer ? <div className="border-t px-4 py-3">{footer}</div> : null}
    </div>
  );
}
