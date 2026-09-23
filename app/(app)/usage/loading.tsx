import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the usage layout (DM block, limits, breakdowns, history) so nothing jumps when data lands. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading usage">
      <PageHeader title="Usage" />
      <div className="space-y-6">
        <div className="rounded-3xl bg-fog p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-28 bg-none bg-background" />
            <Skeleton className="h-5 w-32 rounded-full bg-none bg-background" />
          </div>
          <Skeleton className="mt-5 h-14 w-56 bg-none bg-background sm:h-20" />
          <Skeleton className="mt-6 h-3 w-full rounded-full bg-none bg-background" />
          <div className="mt-6 grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16 bg-none bg-background" />
                <Skeleton className="h-4 w-20 max-w-full bg-none bg-background" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5 sm:p-6">
          <Skeleton className="h-3 w-24" />
          <div className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
              <Skeleton className="h-3 w-24" />
              {Array.from({ length: 3 }, (_, j) => (
                <div key={j} className="space-y-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          ))}
        </div>

        <Skeleton className="h-[300px] w-full rounded-2xl" />
      </div>
    </div>
  );
}
