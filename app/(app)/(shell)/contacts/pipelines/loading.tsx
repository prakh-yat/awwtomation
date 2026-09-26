import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function PipelinesLoading() {
  return (
    <div aria-busy="true" aria-label="Loading pipelines">
      <PageHeader title="Contacts" actions={<Skeleton className="h-8 w-32 rounded-full" />} />

      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="flex gap-2 overflow-hidden lg:flex-col">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="min-w-[13rem] space-y-3 rounded-2xl border bg-card p-4 lg:min-w-0">
              <div className="flex justify-between">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3.5 w-8" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-end gap-3 border-b p-5">
            <div className="flex-1 space-y-2.5">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
            <Skeleton className="h-10 w-32 rounded-full" />
          </div>
          <div className="space-y-1.5 p-5">
            <Skeleton className="mb-4 h-2.5 w-16" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[50px] w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
