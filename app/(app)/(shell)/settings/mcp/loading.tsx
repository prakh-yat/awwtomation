import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the MCP page (the URL block, the filter, then the tool groups) so nothing jumps when data lands. */
export default function McpSettingsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading MCP settings">
      <PageHeader title="Settings" />
      <div className="space-y-8">
        <Skeleton className="h-[124px] w-full rounded-3xl" />
        <div className="space-y-3">
          <Skeleton className="h-10 w-full rounded-xl" />
          <div className="space-y-2">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border bg-card px-5 py-4">
                <Skeleton className="h-3 w-3 rounded-[4px]" />
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="ml-auto h-4 w-4 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
