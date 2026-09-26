import { Skeleton } from "@/components/ui/skeleton";

export default function BroadcastsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading broadcasts">
      <div className="mb-6 flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="mb-6 h-16 w-full" />
      <div className="mb-5 flex gap-2">
        <Skeleton className="h-10 w-64 rounded-full" />
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>
      <div className="overflow-hidden rounded-lg border bg-card shadow-card">
        <div className="border-b px-3 py-3">
          <Skeleton className="h-3 w-full" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-3 py-3 last:border-0">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}
