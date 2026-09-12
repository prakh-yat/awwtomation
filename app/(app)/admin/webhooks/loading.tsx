import { PageHeaderSkeleton, TableSkeleton } from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminWebhooksLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-72" />
      </div>
      <TableSkeleton rows={10} cols={6} />
    </>
  );
}
