import { Skeleton } from "@/components/ui/skeleton";

export default function NewBroadcastLoading() {
  return (
    <div aria-busy="true" aria-label="Loading editor">
      <Skeleton className="mb-2 h-3 w-20" />
      <div className="mb-6 flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <Skeleton className="mb-6 h-16 w-full" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="mx-auto h-[580px] w-[300px] rounded-[2.25rem]" />
      </div>
    </div>
  );
}
