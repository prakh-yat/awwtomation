import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { InboxFrame } from "./inbox-frame";

function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-8" />
        </div>
        <Skeleton className="h-3 w-44" />
      </div>
    </div>
  );
}

function BubbleSkeleton({ outbound = false, className }: { outbound?: boolean; className: string }) {
  return <Skeleton className={cn("h-10 rounded-[20px]", outbound ? "self-end rounded-br-md" : "rounded-bl-md", className)} />;
}

/** Three-pane placeholder for `loading.tsx`, laid out like the real inbox so nothing jumps when it arrives. */
function InboxSkeleton() {
  return (
    <InboxFrame aria-busy="true" aria-label="Loading inbox">
      <div className="flex w-full flex-col border-r md:w-[320px] md:shrink-0 lg:w-[360px]">
        <div className="space-y-3 px-5 pb-3 pt-5 md:pl-10 md:pr-4">
          <PageHeader title="Inbox" className="mb-1" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 min-w-0 flex-1 rounded-xl" />
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          </div>
        </div>
        <div className="space-y-0.5 px-2 md:pl-7">
          {Array.from({ length: 8 }).map((_, i) => (
            <ListRowSkeleton key={i} />
          ))}
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 flex-col md:flex">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b px-5">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="ml-auto flex gap-1.5">
            <Skeleton className="h-9 w-28 rounded-full" />
            <Skeleton className="h-9 w-20 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-end gap-1 px-6 py-4">
          <Skeleton className="mb-2 h-6 w-20 self-center rounded-full" />
          <BubbleSkeleton className="w-56" />
          <BubbleSkeleton className="w-40" />
          <BubbleSkeleton outbound className="mt-3 w-64" />
          <BubbleSkeleton className="mt-3 w-48" />
          <BubbleSkeleton outbound className="mt-3 w-72" />
        </div>
        <div className="px-5 pb-4 pt-1">
          <Skeleton className="mx-auto h-[88px] w-full max-w-4xl rounded-3xl" />
        </div>
      </div>

      <div className="hidden w-[300px] shrink-0 flex-col border-l px-5 pt-7 xl:flex">
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="mt-1 h-4 w-28" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-5 w-24 rounded-full" />
        </div>
        <div className="mt-8 space-y-2.5">
          <Skeleton className="h-3 w-12" />
          <div className="flex gap-1.5">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
        <div className="mt-6 space-y-2.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </InboxFrame>
  );
}

export { InboxSkeleton };
