import { Skeleton } from "@/components/ui/skeleton";

export default function AutomationsLoading() {
  return (
    <div>
      <div className="mb-7 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-8 w-44" />
        </div>
        <div className="ml-auto flex w-full justify-end gap-2 sm:w-auto">
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-40 rounded-full" />
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Skeleton className="h-10 w-full rounded-xl sm:max-w-xs" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 flex-1 rounded-xl sm:w-60 sm:flex-none" />
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-2xl border md:block">
        <div className="flex h-10 items-center border-b px-5">
          <Skeleton className="h-3 w-full" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 border-b px-5 py-3.5 last:border-b-0">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-52" />
              <div className="flex gap-1">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-12 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="hidden h-4 w-24 lg:block" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-6 w-10 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        ))}
      </div>

      <div className="space-y-2.5 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-6 w-10 rounded-full" />
            </div>
            <Skeleton className="mt-3 h-4 w-48" />
            <Skeleton className="mt-2 h-5 w-40 rounded-full" />
            <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
