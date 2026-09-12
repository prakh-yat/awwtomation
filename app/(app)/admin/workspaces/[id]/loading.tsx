import { CardSkeleton, PageHeaderSkeleton } from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminWorkspaceDetailLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-5 shadow-card">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="mt-3 h-7 w-12" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <CardSkeleton lines={8} />
        <div className="lg:col-span-2">
          <CardSkeleton lines={8} />
        </div>
      </div>
      <div className="mt-6">
        <CardSkeleton lines={4} />
      </div>
    </>
  );
}
