import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the report: title, filter row, the numbers, the chart, then the first row of cards. */
export default function Loading() {
  return (
    <div aria-busy aria-label="Loading analytics">
      <div className="mb-7 flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-10 w-[340px] max-w-full rounded-full" />
        <Skeleton className="h-8 w-[118px] rounded-full" />
      </div>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[124px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-[400px] w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr]">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
