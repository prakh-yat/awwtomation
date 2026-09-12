import { Skeleton } from "@/components/ui/skeleton";

export default function BillingSettingsLoading() {
  return (
    <div className="space-y-8">
      <div className="rounded-lg border bg-card p-5 shadow-card">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-16" />
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3.5 w-16" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <Skeleton className="mb-3 h-5 w-16" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-5 shadow-card">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="mt-2 h-3 w-full" />
              <Skeleton className="mt-1 h-3 w-3/4" />
              <Skeleton className="mt-4 h-8 w-24" />
              <Skeleton className="mt-5 h-9 w-full" />
              <div className="mt-5 space-y-2">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-3 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Skeleton className="mb-3 h-5 w-28" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </div>
  );
}
