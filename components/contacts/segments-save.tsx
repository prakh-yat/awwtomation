"use client";

import * as React from "react";
import { Bookmark, BookmarkPlus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import type { SegmentFilters, SegmentSummary } from "@/lib/services/segments";

import { errorMessage, segmentsApi } from "./api";
import { type ContactFilterState, describeSegmentFilters, hasActiveFilters, type PipelineNames, stateToSegmentFilters } from "./filters";
import { SegmentFormDialog } from "./segments-dialog";

export interface SegmentSaveActionsProps {
  filters: ContactFilterState;
  /** Segment the toolbar was loaded from, if any. */
  active: SegmentSummary | null;
  /** True when the toolbar no longer matches `active`'s filters. */
  dirty: boolean;
  onCreated: (segment: SegmentSummary) => void;
  onUpdated: (segment: SegmentSummary) => void;
  /** Restore the active segment's filters. */
  onReset: () => void;
  /** Names for pipeline and stage filters in the save dialog's summary. */
  pipelines?: PipelineNames;
}

/**
 * The toolbar's segment buttons. Nothing when there is nothing to save;
 * "Save as segment" for ad-hoc filters; "Save changes" / "Save as new" / reset
 * once a loaded segment has been edited.
 */
function SegmentSaveActions({ filters, active, dirty, onCreated, onUpdated, onReset, pipelines }: SegmentSaveActionsProps) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [previewCount, setPreviewCount] = React.useState<number | null>(null);

  const segmentFilters = React.useMemo<SegmentFilters>(() => stateToSegmentFilters(filters), [filters]);
  const filtered = hasActiveFilters(filters);

  // The count in the dialog comes from the same predicate the list uses, so it matches the table.
  React.useEffect(() => {
    if (!createOpen) return;
    const controller = new AbortController();
    setPreviewCount(null);
    segmentsApi
      .preview(segmentFilters, controller.signal)
      .then((count) => {
        if (!controller.signal.aborted) setPreviewCount(count);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [createOpen, segmentFilters]);

  async function create(values: { name: string; description: string | null }) {
    const segment = await segmentsApi.create({ ...values, filters: segmentFilters });
    toast.success(`Saved “${segment.name}”`);
    onCreated(segment);
  }

  async function saveChanges() {
    if (!active) return;
    setSaving(true);
    try {
      const segment = await segmentsApi.update(active.id, { filters: segmentFilters });
      toast.success(`Updated “${segment.name}”`);
      onUpdated(segment);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't update the segment"));
    } finally {
      setSaving(false);
    }
  }

  if (!active && !filtered) return null;
  if (active && !dirty) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {active ? (
          <>
            <Button size="sm" className="h-8" onClick={saveChanges} loading={saving}>
              <Bookmark />
              Save changes
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => setCreateOpen(true)} disabled={saving}>
              <BookmarkPlus />
              Save as new
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onReset} disabled={saving} aria-label="Discard changes to the segment filters">
              <RotateCcw />
              Reset
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" className="h-8" onClick={() => setCreateOpen(true)}>
            <BookmarkPlus />
            Save as segment
          </Button>
        )}
      </div>

      <SegmentFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        initialName={active ? `${active.name} (copy)` : ""}
        count={previewCount}
        summary={describeSegmentFilters(segmentFilters, pipelines)}
        onSubmit={create}
      />
    </>
  );
}

export { SegmentSaveActions };
