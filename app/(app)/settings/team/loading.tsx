import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center gap-4 border-b px-5 py-3.5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="ml-auto h-3 w-12" />
        <Skeleton className="hidden h-3 w-16 sm:block" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b px-5 py-3 last:border-0">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-3.5 w-36 max-w-full" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
          <Skeleton className="ml-auto h-5 w-16 shrink-0 rounded-full" />
          <Skeleton className="hidden h-3 w-24 sm:block" />
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Mirrors the team layout (members, then invitations) so nothing jumps when data lands. */
export default function TeamSettingsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading team">
      <PageHeader title="Settings" />
      <div className="space-y-10">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-40" />
          </div>
          <TableSkeleton rows={3} />
        </section>
        <section>
          <Skeleton className="mb-3 h-3 w-36" />
          <TableSkeleton rows={1} />
        </section>
      </div>
    </div>
  );
}
