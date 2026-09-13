import { Skeleton } from "@/components/ui/skeleton";

export default function BroadcastLoading() {
  return (
    <div aria-busy="true" aria-label="Loading broadcast">
      <Skeleton className="mb-2 h-3 w-20" />
      <div className="mb-6 flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-96 w-full rounded-lg" />
        <Skeleton className="mx-auto h-[580px] w-[300px] rounded-[2.25rem]" />
      </div>
    </div>
  );
}
