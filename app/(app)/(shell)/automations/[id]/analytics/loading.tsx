import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the report: back link, title, what it is of, the filter row, the numbers and the chart. */
export default function AnalyticsLoading() {
  return (
    <div aria-busy aria-label="Loading report">
      <div className="mb-7">
        <Skeleton className="mb-4 h-4 w-28" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="h-8 w-64 max-w-[60vw]" />
          </div>
          <Skeleton className="h-8 w-36 rounded-full" />
        </div>
      </div>
      <Skeleton className="-mt-3 mb-6 h-5 w-80 max-w-full" />
      <Skeleton className="mb-6 h-10 w-[340px] max-w-full rounded-full" />
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className={i === 4 ? "col-span-2 h-[124px] rounded-2xl lg:col-span-1" : "h-[124px] rounded-2xl"} />
          ))}
        </div>
        <Skeleton className="h-[380px] rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
