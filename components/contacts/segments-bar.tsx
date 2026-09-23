"use client";

import * as React from "react";
import { Bookmark, Pencil, Trash2 } from "lucide-react";

import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { FilterMenu } from "@/components/ui/filter-menu";
import type { SegmentSummary } from "@/lib/services/segments";

import { filterPill } from "./filter-pill";
import { describeSegmentFilters, type PipelineNames } from "./filters";

export interface SegmentsBarProps {
  segments: SegmentSummary[];
  activeId: string | null;
  /** True when the toolbar no longer matches the active segment's filters. */
  edited: boolean;
  /** Workspace-wide contact count for "All contacts". */
  totalCount: number;
  onSelect: (id: string | null) => void;
  onRename: (segment: SegmentSummary) => void;
  onDelete: (segment: SegmentSummary) => void;
  /** Names for pipeline and stage filters in each segment's description. */
  pipelines?: PipelineNames;
  className?: string;
}

/** Stands in for "no segment": Radix menus can't represent an empty value. */
const ALL = "__all__";

/**
 * Saved segments in one filter menu, "All contacts" first, each with its live
 * count. The active segment is named on the button (with a yellow dot once the
 * toolbar has moved away from its filters) and can be renamed or deleted from
 * the bottom of the menu.
 */
function SegmentsBar({ segments, activeId, edited, totalCount, onSelect, onRename, onDelete, pipelines, className }: SegmentsBarProps) {
  const active = segments.find((s) => s.id === activeId) ?? null;

  return (
    <FilterMenu
      label="Segments"
      showLabel
      icon={Bookmark}
      triggerClassName={filterPill}
      value={active ? active.id : ALL}
      onChange={(value) => onSelect(value === ALL ? null : value)}
      defaultValue={ALL}
      align="start"
      marked={Boolean(active && edited)}
      markLabel="edited"
      className={className}
      options={[
        { value: ALL, label: "All contacts", count: totalCount },
        ...segments.map((s) => ({ value: s.id, label: s.name, count: s.count, hint: s.description || describeSegmentFilters(s.filters, pipelines) })),
      ]}
      footer={
        active ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onRename(active)}>
              <Pencil />
              Rename segment
            </DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={() => onDelete(active)}>
              <Trash2 />
              Delete segment
            </DropdownMenuItem>
          </>
        ) : null
      }
    />
  );
}

export { SegmentsBar };
