import { Skeleton } from "@/components/ui/skeleton";

import { InboxFrame } from "./inbox-frame";

function ListRowSkeleton() {
  return (
    <div className="flex items-start gap-3 border-b px-4 py-3">
      <Skeleton className="h-9 w-9 rounded-full" />
      <div className="flex-1 space-y-2 pt-0.5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-8" />
        </div>
        <Skeleton className="h-3 w-44" />
      </div>
    </div>
  );
}

function BubbleSkeleton({ outbound = false, width = "w-48" }: { outbound?: boolean; width?: string }) {
  return (
    <div className={outbound ? "flex justify-end" : "flex justify-start"}>
      <Skeleton className={`h-10 ${width} rounded-2xl`} />
    </div>
  );
}

/** Three-pane placeholder shared by `loading.tsx` and the shell while a thread loads. */
function InboxSkeleton() {
  return (
    <InboxFrame aria-busy="true" aria-label="Loading inbox">
      <div className="flex w-full flex-col border-r md:w-[340px] md:shrink-0">
        <div className="space-y-3 border-b px-4 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-8 w-full" />
          <div className="flex gap-1.5">
            <Skeleton className="h-6 w-12 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-14 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <ListRowSkeleton key={i} />
        ))}
      </div>

      <div className="hidden min-w-0 flex-1 flex-col md:flex">
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
        <div className="flex-1 space-y-3 px-6 py-5">
          <BubbleSkeleton width="w-56" />
          <BubbleSkeleton outbound width="w-64" />
          <BubbleSkeleton width="w-40" />
          <BubbleSkeleton outbound width="w-72" />
        </div>
        <div className="border-t p-4">
          <Skeleton className="h-20 w-full" />
        </div>
      </div>

      <div className="hidden w-[300px] shrink-0 flex-col border-l p-5 xl:flex">
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-14 w-14 rounded-full" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="mt-6 space-y-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-6 w-full" />
        </div>
        <div className="mt-6 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </InboxFrame>
  );
}

export { InboxSkeleton };
