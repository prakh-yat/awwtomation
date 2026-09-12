import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the logs layout (header → filters → chips → table) so nothing jumps when data lands. */
export default function LogsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading delivery logs">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-[420px] max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-8 w-[200px]" />
          <Skeleton className="h-8 w-[140px]" />
          <Skeleton className="h-8 w-[190px]" />
          <Skeleton className="h-8 w-[300px]" />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-full" />
          ))}
        </div>

        <div className="rounded-lg border bg-card shadow-card">
          <div className="border-b px-3 py-2.5">
            <Skeleton className="h-3 w-full" />
          </div>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 border-b px-3 py-3 last:border-0">
              <Skeleton className="h-3.5 w-3.5" />
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
