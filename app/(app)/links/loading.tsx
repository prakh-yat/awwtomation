import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the links layout (header → stat row → toolbar → table) so nothing jumps when data lands. */
export default function LinksLoading() {
  return (
    <div aria-busy="true" aria-label="Loading tracked links">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-[380px] max-w-full" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="rounded-lg border bg-card p-5 shadow-card">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="mt-3 h-7 w-16" />
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-72" />
            <Skeleton className="ml-auto h-3.5 w-16" />
          </div>
          <div className="rounded-lg border bg-card shadow-card">
            <div className="border-b px-3 py-2.5">
              <Skeleton className="h-3 w-full" />
            </div>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 border-b px-3 py-3 last:border-0">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3.5 flex-1" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-3.5 w-8" />
                <Skeleton className="h-3.5 w-8" />
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-7 w-7" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
