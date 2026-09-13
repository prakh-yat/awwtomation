import type { Metadata } from "next";

import { ContactsView } from "@/components/contacts/contacts-view";
import { filtersFromSearchParams, filtersToServiceFilters, hasActiveFilters, parsePage, parsePageSize, segmentFiltersToState } from "@/components/contacts/filters";
import { contactStats, listContactChannels, listContacts, listOwners, listTags } from "@/lib/services/contacts";
import { listPipelines } from "@/lib/services/pipelines";
import { listSegments } from "@/lib/services/segments";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { canManageSettings } from "@/lib/workspace/permissions";

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
 * win and the view shows "Save changes". An unknown segment, pipeline or
 * stage id falls back to all contacts.
 */
export default async function ContactsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireWorkspaceContext();
  const params = await searchParams;

  const [segments, stats, tags, channels, owners, pipelines] = await Promise.all([
    listSegments(ctx.workspace.id),
    contactStats(ctx.workspace.id),
    listTags(ctx.workspace.id),
    listContactChannels(ctx.workspace.id),
    listOwners(ctx.workspace.id),
    listPipelines(ctx.workspace.id),
  ]);
  const requestedSegment = firstParam(params, "segment");
  const activeSegment = requestedSegment ? (segments.find((s) => s.id === requestedSegment) ?? null) : null;

  const urlFilters = filtersFromSearchParams(params);
  // Links may say `ownerId=me`; the toolbar works with real member ids.
  if (urlFilters.ownerId === "me") urlFilters.ownerId = ctx.user.id;
  const pipeline = pipelines.find((p) => p.id === urlFilters.pipelineId);
  if (!pipeline) urlFilters.pipelineId = "";
  if (!pipeline?.stages.some((s) => s.id === urlFilters.stageId)) urlFilters.stageId = "";

  const filters = activeSegment && !hasActiveFilters(urlFilters) ? segmentFiltersToState(activeSegment.filters) : urlFilters;
  const view = firstParam(params, "view") === "board" && filters.pipelineId ? "board" : "list";
  const page = parsePage(firstParam(params, "page"));
  const pageSize = parsePageSize(firstParam(params, "pageSize"));
  const result = view === "list" ? await listContacts(ctx.workspace.id, { ...filtersToServiceFilters(filters), page, pageSize }) : null;

  return (
    <ContactsView
      initialResult={result}
      initialPage={page}
      initialPageSize={pageSize}
      initialFilters={filters}
      initialView={view}
      segments={segments}
      activeSegmentId={activeSegment?.id ?? null}
      channels={channels}
      tags={tags}
      stats={stats}
      pipelines={pipelines}
      owners={owners.map((o) => ({ id: o.id, name: o.name, email: o.email, avatarUrl: o.avatarUrl }))}
      viewerId={ctx.user.id}
      canManagePipelines={canManageSettings(ctx.role)}
      timezone={ctx.workspace.timezone}
    />
  );
}
