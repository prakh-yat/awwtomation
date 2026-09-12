import { Skeleton } from "@/components/ui/skeleton";

export default function ContactLoading() {
  return (
    <div aria-busy="true" aria-label="Loading contact">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="space-y-6">
          <div className="rounded-lg border bg-card p-5 shadow-card">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-2 h-3 w-64" />
            <div className="mt-5 space-y-5">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
          <div className="rounded-lg border bg-card p-5 shadow-card">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-9 w-36" />
          </div>
        </div>
        <div className="space-y-6">
          <div className="rounded-lg border bg-card p-5 shadow-card">
            <Skeleton className="h-4 w-20" />
            <div className="mt-4 grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-2 h-6 w-10" />
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-3 border-t pt-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-3.5 w-full" />
              ))}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-5 shadow-card">
            <Skeleton className="h-4 w-20" />
            <div className="mt-5 space-y-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
