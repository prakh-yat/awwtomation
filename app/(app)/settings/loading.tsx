import { Skeleton } from "@/components/ui/skeleton";

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-lg border bg-card p-5 shadow-card">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-2 h-3 w-72" />
      <div className="mt-5 space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GeneralSettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-5 shadow-card">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-3 w-80" />
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      </div>
      <CardSkeleton rows={2} />
      <CardSkeleton rows={2} />
    </div>
  );
}
