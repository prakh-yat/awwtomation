import { CardSkeleton, PageHeaderSkeleton, StatGridSkeleton } from "@/components/admin/skeletons";

export default function AdminOverviewLoading() {
  return (
    <>
      <PageHeaderSkeleton />
      <StatGridSkeleton count={8} />
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CardSkeleton lines={9} />
        </div>
        <CardSkeleton lines={9} />
      </div>
    </>
  );
}
