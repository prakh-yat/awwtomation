import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the links layout (header, stat strip, search, table) so nothing jumps when data lands. */
export default function LinksLoading() {
  return (
    <div aria-busy="true" aria-label="Loading tracked links">
      <div className="mb-7 flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="ml-auto h-9 w-28 rounded-full" />
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className={i === 0 ? "col-span-2 rounded-2xl border p-5 lg:col-span-1" : "rounded-2xl border p-5"}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-6 h-8 w-20" />
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-full rounded-full sm:w-72" />
            <Skeleton className="ml-auto hidden h-3.5 w-16 sm:block" />
          </div>
          <div className="rounded-2xl border bg-card">
            <div className="border-b px-5 py-3">
              <Skeleton className="h-3 w-full" />
            </div>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 border-b px-5 py-3.5 last:border-0">
                <div className="w-40 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="hidden h-3.5 flex-1 md:block" />
                <Skeleton className="hidden h-5 w-24 rounded-full md:block" />
                <Skeleton className="ml-auto h-1.5 w-14 rounded-full" />
                <Skeleton className="h-3.5 w-8" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
