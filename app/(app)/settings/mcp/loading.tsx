import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the MCP page (the URL card, the apps, then the tools three to a row) so nothing jumps when data lands. */
export default function McpSettingsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading MCP settings">
      <PageHeader title="Settings" />
      <div className="space-y-10">
        <div className="rounded-2xl border bg-card p-5 sm:p-6">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-3 h-10 w-full rounded-xl" />
          <Skeleton className="mt-3 h-3 w-2/3" />
          <Skeleton className="mt-6 h-8 w-full max-w-md rounded-full" />
          <div className="mt-4 space-y-2.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <section>
          <Skeleton className="mb-3 h-3 w-32" />
          <div className="rounded-2xl border bg-card px-5 py-4 sm:px-6">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="mt-2 h-3 w-72 max-w-full" />
          </div>
        </section>
        <section>
          <Skeleton className="mb-4 h-3 w-20" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32 max-w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-32 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
