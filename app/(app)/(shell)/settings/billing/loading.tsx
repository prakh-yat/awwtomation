import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the billing layout (plan block, plan grid, payments) so nothing jumps when data lands. */
export default function BillingSettingsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading billing">
      <PageHeader title="Settings" />
      <div className="space-y-10">
        <div className="rounded-3xl bg-indigo px-6 py-7 sm:px-8 sm:py-8">
          <Skeleton className="h-3 w-24 bg-none bg-white/15" />
          <div className="mt-5 flex items-end justify-between gap-6">
            <Skeleton className="h-12 w-40 bg-none bg-white/15 sm:h-16" />
            <Skeleton className="h-9 w-24 bg-none bg-white/15" />
          </div>
          <Skeleton className="mt-5 h-3.5 w-72 max-w-full bg-none bg-white/10" />
          <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-3 w-28 bg-none bg-white/10" />
                <Skeleton className="h-1.5 w-full rounded-full bg-none bg-white/15" />
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-10 w-56 rounded-full" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="rounded-3xl bg-fog p-6">
                <Skeleton className="h-7 w-24 bg-none bg-background" />
                <Skeleton className="mt-3 h-3 w-full bg-none bg-background" />
                <Skeleton className="mt-6 h-10 w-28 bg-none bg-background" />
                <Skeleton className="mt-6 h-11 w-full rounded-full bg-none bg-background" />
                <div className="mt-6 space-y-2.5">
                  {Array.from({ length: 5 }, (_, j) => (
                    <Skeleton key={j} className="h-3 w-full bg-none bg-background" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Skeleton className="mb-4 h-3 w-28" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
