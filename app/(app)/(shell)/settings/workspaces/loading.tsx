import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the workspaces list so nothing jumps when data lands. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading workspaces">
      <PageHeader title="Settings" />
      <div className="space-y-3">
        <Skeleton className="h-3 w-64 max-w-full" />
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5 lg:flex-row lg:items-center lg:gap-6">
            <div className="flex flex-1 items-center gap-4">
              <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
            <Skeleton className="h-[62px] w-full rounded-2xl lg:w-[380px]" />
            <Skeleton className="h-8 w-20 rounded-full lg:ml-4" />
          </div>
        ))}
      </div>
    </div>
  );
}
