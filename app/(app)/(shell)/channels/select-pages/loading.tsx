import { Skeleton } from "@/components/ui/skeleton";

export default function SelectPagesLoading() {
  return (
    <div className="mx-auto max-w-2xl" aria-busy="true" aria-label="Loading your Facebook Pages">
      <div className="mb-7">
        <Skeleton className="mb-3 h-4 w-20" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-8 w-64 max-w-full" />
        </div>
      </div>
      <div className="rounded-2xl border bg-card">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3.5 border-b px-4 py-3.5 sm:px-5">
            <Skeleton className="h-[18px] w-[18px] rounded-[6px]" />
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-11 w-40 rounded-full" />
        </div>
      </div>
    </div>
  );
}
