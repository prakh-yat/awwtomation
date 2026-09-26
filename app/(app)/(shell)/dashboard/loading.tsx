import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function ListCardSkeleton({ rows, className }: { rows: number; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
      </CardHeader>
      <div className="divide-y overflow-hidden border-t">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Mirrors the one-screen dashboard so nothing jumps when the data lands. */
export default function DashboardLoading() {
  return (
    <div aria-busy aria-label="Loading dashboard" className="flex flex-col lg:h-[calc(100dvh-3.5rem)] lg:min-h-[40rem]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-8 w-44" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="-ml-2 h-9 w-9 rounded-full border-2 border-background first:ml-0" />
            ))}
          </div>
          <Skeleton className="h-10 w-28 rounded-full" />
          <Skeleton className="h-10 w-[132px] rounded-full" />
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-2xl" />
        ))}
      </div>

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-4 lg:col-span-2">
          <Card className="min-h-[18rem] overflow-hidden p-5 lg:min-h-0 lg:flex-[3]">
            <Skeleton className="h-10 w-80 max-w-full rounded-full" />
            <Skeleton className="mt-5 h-[calc(100%-3.75rem)] min-h-[12rem] w-full" />
          </Card>
          <ListCardSkeleton rows={4} className="overflow-hidden lg:min-h-0 lg:flex-[2]" />
        </div>
        <div className="flex min-h-0 flex-col gap-4">
          <Skeleton className="h-[112px] shrink-0 rounded-2xl" />
          <ListCardSkeleton rows={5} className="min-h-[16rem] overflow-hidden lg:min-h-0 lg:flex-1" />
          <Skeleton className="h-[92px] shrink-0 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
