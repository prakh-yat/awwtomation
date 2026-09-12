import { Skeleton } from "@/components/ui/skeleton";

export default function SelectPagesLoading() {
  return (
    <div className="mx-auto max-w-2xl" aria-busy="true" aria-label="Loading your Facebook Pages">
      <div className="mb-6">
        <Skeleton className="mb-2 h-3 w-16" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <div className="rounded-lg border bg-card shadow-card">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0">
            <Skeleton className="h-4 w-4 rounded-sm" />
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between border-t px-5 py-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
    </div>
  );
}
