import { PageHeaderSkeleton, TableSkeleton } from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminJobsLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="mb-4 flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28" />
        ))}
      </div>
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-48" />
      </div>
      <TableSkeleton rows={10} cols={7} />
    </>
  );
}
