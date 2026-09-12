import type { Metadata } from "next";

import { brand } from "@/lib/brand";
import { getLogStats, listDeliveryLogs, listLogFilterOptions } from "@/lib/services/logs";
import { requireWorkspaceContext } from "@/lib/workspace/context";

import { logFiltersFromSearchParams, logFiltersToServiceFilters } from "./filters";
import { LogsView } from "./logs-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: `Delivery logs · ${brand.name}` };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LogsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireWorkspaceContext();
  const filters = logFiltersFromSearchParams(await searchParams);
  const serviceFilters = logFiltersToServiceFilters(filters);
  const timezone = ctx.workspace.timezone;

  const [page, stats, options] = await Promise.all([
    listDeliveryLogs(ctx.workspace.id, { ...serviceFilters, timezone }),
    getLogStats(ctx.workspace.id, { ...serviceFilters, timezone }),
    listLogFilterOptions(ctx.workspace.id),
  ]);

  return (
    <LogsView
      initialItems={page.items}
      initialCursor={page.nextCursor}
      initialStats={stats}
      initialFilters={filters}
      options={options}
      timezone={timezone}
    />
  );
}
