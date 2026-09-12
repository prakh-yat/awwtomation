import { Skeleton } from "@/components/ui/skeleton";

export function PageHeaderSkeleton() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-80" />
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-5 shadow-card">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-lg border bg-card shadow-card">
      <div className="flex gap-6 border-b px-3 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-20" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-6 border-b px-3 py-3 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 w-24" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div className="rounded-lg border bg-card p-5 shadow-card">
      <Skeleton className="h-4 w-32" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 w-full" />
        ))}
      </div>
    </div>
  );
}
