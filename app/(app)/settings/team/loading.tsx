import { Skeleton } from "@/components/ui/skeleton";

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-card">
      <div className="flex items-center gap-4 border-b px-3 py-2.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="ml-auto h-3 w-12" />
        <Skeleton className="h-3 w-16" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b px-3 py-2.5 last:border-0">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="ml-auto h-8 w-[130px]" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-8" />
        </div>
      ))}
    </div>
  );
}

export default function TeamSettingsLoading() {
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-end justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-32" />
        </div>
        <TableSkeleton rows={3} />
      </section>
      <section>
        <div className="mb-3 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
        <TableSkeleton rows={2} />
      </section>
    </div>
  );
}
