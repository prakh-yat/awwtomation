"use client";

import * as React from "react";
import { Layers, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger } from "@/components/ui/select";
import type { SegmentSummary } from "@/lib/services/segments";
import { cn, formatNumber } from "@/lib/utils";

import { describeSegmentFilters, type PipelineNames } from "./filters";

const ALL = "__all__";

export interface SegmentsRailProps {
  segments: SegmentSummary[];
  activeId: string | null;
  /** Workspace-wide contact count for the "All contacts" row. */
  totalCount: number;
  onSelect: (id: string | null) => void;
  onRename: (segment: SegmentSummary) => void;
  onDelete: (segment: SegmentSummary) => void;
  /** Names for pipeline and stage filters in the row tooltips. */
  pipelines?: PipelineNames;
  className?: string;
}

function SegmentActionsMenu({ segment, onRename, onDelete, className }: { segment: SegmentSummary; onRename: () => void; onDelete: () => void; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("h-6 w-6", className)} aria-label={`Actions for ${segment.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onSelect={onRename}>
          <Pencil />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={onDelete}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Left rail: "All contacts" plus every saved segment with its live count.
 * Desktop only — `SegmentsSelect` is the compact equivalent for narrow screens.
 */
function SegmentsRail({ segments, activeId, totalCount, onSelect, onRename, onDelete, pipelines, className }: SegmentsRailProps) {
  return (
    <nav aria-label="Segments" className={cn("w-[240px] shrink-0", className)}>
      <div className="mb-2 flex items-center justify-between px-2">
        <span className="text-xs font-medium text-muted-foreground">Segments</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{segments.length}</span>
      </div>
      <ul className="space-y-0.5">
        <li>
          <RailRow active={activeId === null} onClick={() => onSelect(null)} icon={<Users className="h-3.5 w-3.5" />} label="No segment" count={totalCount} />
        </li>
        {segments.map((s) => (
          <li key={s.id} className="group relative">
            <RailRow
              active={activeId === s.id}
              onClick={() => onSelect(s.id)}
              icon={<Layers className="h-3.5 w-3.5" />}
              label={s.name}
              count={s.count}
              title={s.description || describeSegmentFilters(s.filters, pipelines)}
              trailingSpace
            />
            <SegmentActionsMenu
              segment={s}
              onRename={() => onRename(s)}
              onDelete={() => onDelete(s)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
            />
          </li>
        ))}
      </ul>
      {segments.length === 0 ? (
        <p className="mt-3 px-2 text-[12px] leading-relaxed text-muted-foreground">
          Filter the list, then use <span className="font-medium text-foreground">Save as segment</span> to keep it here.
        </p>
      ) : null}
    </nav>
  );
}

function RailRow({
  active,
  onClick,
  icon,
  label,
  count,
  title,
  trailingSpace = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  title?: string;
  /** Leaves room for the hover actions button so the count doesn't sit under it. */
  trailingSpace?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      title={title}
      className={cn(
        "relative flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors",
        active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {/* Subtle brand accent for the active row — the only place lavender appears on this page. */}
      {active ? <span aria-hidden className="absolute left-0 top-1.5 h-5 w-0.5 rounded-full bg-lavender" /> : null}
      <span className={cn("shrink-0", active ? "text-foreground" : "text-muted-foreground")}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className={cn("shrink-0 text-[11px] tabular-nums text-muted-foreground transition-opacity", trailingSpace && "group-hover:opacity-0")}>
        {formatNumber(count)}
      </span>
    </button>
  );
}

export interface SegmentsSelectProps {
  segments: SegmentSummary[];
  activeId: string | null;
  totalCount: number;
  onSelect: (id: string | null) => void;
  onRename: (segment: SegmentSummary) => void;
  onDelete: (segment: SegmentSummary) => void;
  className?: string;
}

/** Narrow-screen replacement for the rail: a Select plus the active segment's actions. */
function SegmentsSelect({ segments, activeId, totalCount, onSelect, onRename, onDelete, className }: SegmentsSelectProps) {
  const active = segments.find((s) => s.id === activeId) ?? null;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Select value={activeId ?? ALL} onValueChange={(v) => onSelect(v === ALL ? null : v)}>
        <SelectTrigger className={cn("h-8 w-auto min-w-[8.5rem] max-w-[14rem] gap-2 text-[13px]", active && "border-foreground")} aria-label="Segment">
          {/* A div, not a span: the trigger line-clamps direct span children. */}
          <div className="flex min-w-0 items-center gap-2">
            <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className={cn("truncate", !active && "text-muted-foreground")}>{active ? active.name : "Segments"}</div>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>
            <span className="inline-flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              No segment
              <span className="tabular-nums text-muted-foreground">{formatNumber(totalCount)}</span>
            </span>
          </SelectItem>
          {segments.length > 0 ? <SelectSeparator /> : null}
          {segments.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              <span className="inline-flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{s.name}</span>
                <span className="tabular-nums text-muted-foreground">{formatNumber(s.count)}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {active ? <SegmentActionsMenu segment={active} onRename={() => onRename(active)} onDelete={() => onDelete(active)} className="h-8 w-8" /> : null}
    </div>
  );
}

export { SegmentsRail, SegmentsSelect };
