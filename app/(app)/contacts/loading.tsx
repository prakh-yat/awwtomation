import { Skeleton } from "@/components/ui/skeleton";

export default function ContactsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading contacts">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>

      <div className="flex items-start gap-6">
        {/* Segments rail */}
        <div className="hidden w-[240px] shrink-0 space-y-1 2xl:block">
          <Skeleton className="mb-2 ml-2 h-3 w-16" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex gap-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-32" />
          </div>

          <div className="rounded-lg border bg-card shadow-card">
            <div className="border-b px-3 py-2.5">
              <Skeleton className="h-3 w-full" />
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-b px-3 py-3 last:border-0">
                <Skeleton className="h-4 w-4 rounded-sm" />
                <Skeleton className="h-7 w-7 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-7 w-28 rounded-full" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-3.5 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
