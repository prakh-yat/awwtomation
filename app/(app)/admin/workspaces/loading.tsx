import { PageHeaderSkeleton, TableSkeleton } from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminWorkspacesLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-9 w-40" />
      </div>
      <TableSkeleton rows={10} cols={7} />
    </>
  );
}
