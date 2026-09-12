import { Skeleton } from "@/components/ui/skeleton";

export default function ChannelsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading channels">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-48" />
        </div>
      </div>
      <Skeleton className="mb-4 h-4 w-64" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card shadow-card">
            <div className="flex items-start gap-3 p-5">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x border-y">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="space-y-2 px-5 py-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-5 w-10" />
                </div>
              ))}
            </div>
            <div className="flex gap-4 px-5 py-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
