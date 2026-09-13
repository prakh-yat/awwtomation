import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function ListCardSkeleton({ rows, className }: { rows: number; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <div className="divide-y border-t">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5">
            <Skeleton className="h-8 w-8 rounded-full" />
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

/** Mirrors the dashboard layout so the page doesn't jump when data lands. */
export default function DashboardLoading() {
  return (
    <div aria-busy aria-label="Loading dashboard">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-[132px]" />
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="overflow-hidden xl:col-span-2">
            <div className="grid grid-cols-2 border-b sm:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="space-y-2 border-l px-5 py-4 first:border-l-0">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
            <CardContent className="p-5">
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
          <div className="space-y-6">
            <ListCardSkeleton rows={2} />
            <Card>
              <CardHeader className="pb-4">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-1.5 w-full" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader className="pb-4">
              <Skeleton className="h-4 w-36" />
            </CardHeader>
            <CardContent className="space-y-3 border-t pt-4">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </CardContent>
          </Card>
          <ListCardSkeleton rows={4} />
        </div>
      </div>
    </div>
  );
}
