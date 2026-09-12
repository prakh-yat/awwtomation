import { CardSkeleton, PageHeaderSkeleton } from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminHealthLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <Skeleton className="mb-4 h-20 w-full rounded-lg" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CardSkeleton lines={9} />
        </div>
        <div className="space-y-4">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={5} />
        </div>
      </div>
    </>
  );
}
