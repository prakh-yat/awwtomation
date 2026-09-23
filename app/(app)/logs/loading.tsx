import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the logs layout (header, filters, table) so nothing jumps when data lands. */
export default function LogsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading delivery logs">
      <div className="mb-7 flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="h-8 w-24" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-32 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-full rounded-full sm:w-64" />
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-9 w-[calc(50%-4px)] rounded-full sm:w-[160px]" />
          <Skeleton className="h-9 w-[calc(50%-4px)] rounded-full sm:w-[190px]" />
          <Skeleton className="h-9 w-[calc(50%-4px)] rounded-full sm:w-32" />
        </div>

        <div className="rounded-2xl border bg-card">
          <div className="border-b px-4 py-3">
            <Skeleton className="h-3 w-full" />
          </div>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-0">
              <Skeleton className="h-3.5 w-3.5" />
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="hidden h-[18px] w-[18px] rounded-md sm:block" />
              <Skeleton className="hidden h-3.5 w-28 sm:block" />
              <Skeleton className="hidden h-3.5 w-24 md:block" />
              <Skeleton className="hidden h-3.5 flex-1 lg:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
