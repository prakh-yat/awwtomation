import type { Metadata } from "next";

import { ContactsView } from "@/components/contacts/contacts-view";
import { filtersFromSearchParams, filtersToServiceFilters, hasActiveFilters, segmentFiltersToState } from "@/components/contacts/filters";
import { contactStats, listContactChannels, listContacts, listTags } from "@/lib/services/contacts";
import { listSegments } from "@/lib/services/segments";
import { requireWorkspaceContext } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Contacts" };

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(params: SearchParams, key: string): string {
  const v = params[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

/**
 * `?segment=<id>` alone loads that segment's saved filters; any explicit
 * filter params alongside it mean the user has edited the toolbar, so those
 * win and the view shows "Save changes". An unknown id falls back to all contacts.
 */
export default async function ContactsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireWorkspaceContext();
  const params = await searchParams;

  // The first page depends on which segment is active, so segments resolve alongside the cheap lookups and the list follows.
  const [segments, stats, tags, channels] = await Promise.all([
    listSegments(ctx.workspace.id),
    contactStats(ctx.workspace.id),
    listTags(ctx.workspace.id),
    listContactChannels(ctx.workspace.id),
  ]);
  const requestedSegment = firstParam(params, "segment");
  const activeSegment = requestedSegment ? (segments.find((s) => s.id === requestedSegment) ?? null) : null;

  const urlFilters = filtersFromSearchParams(params);
  const filters = activeSegment && !hasActiveFilters(urlFilters) ? segmentFiltersToState(activeSegment.filters) : urlFilters;
  const page = await listContacts(ctx.workspace.id, filtersToServiceFilters(filters));

  return (
    <ContactsView
      initialItems={page.items}
      initialCursor={page.nextCursor}
      initialFilters={filters}
      segments={segments}
      activeSegmentId={activeSegment?.id ?? null}
      channels={channels}
      tags={tags}
      stats={stats}
      timezone={ctx.workspace.timezone}
    />
  );
}
