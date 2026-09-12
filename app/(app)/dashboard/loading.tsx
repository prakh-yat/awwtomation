import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function CardSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

/** Mirrors the dashboard layout so the page doesn't jump when data lands. */
export default function DashboardLoading() {
  return (
    <div aria-busy aria-label="Loading overview">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-[190px]" />
          <Skeleton className="h-9 w-[132px]" />
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="rounded-lg border bg-card p-5 shadow-card">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="mt-3 h-7 w-16" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[260px] w-full" />
            </CardContent>
          </Card>
          <CardSkeleton rows={4} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <CardSkeleton rows={8} className="lg:col-span-2" />
          <CardSkeleton rows={3} />
        </div>
      </div>
    </div>
  );
}
