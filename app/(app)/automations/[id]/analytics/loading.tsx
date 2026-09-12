import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsLoading() {
  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="mt-6 h-[360px] rounded-lg" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}
