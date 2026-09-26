import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

function FormSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-3xl border bg-card">
      <div className="flex-1 px-5 pb-6 pt-5 sm:px-6 sm:pt-6">
        <Skeleton className="h-3 w-24" />
        <div className="mt-5">{children}</div>
      </div>
      <div className="flex justify-end border-t px-5 py-3 sm:px-6">
        <Skeleton className="h-8 w-16 rounded-full" />
      </div>
    </div>
  );
}

function FieldSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-3.5 w-16" />
      <Skeleton className="h-10 w-full rounded-xl" />
    </div>
  );
}

/** Mirrors the general settings layout (two forms, then the danger zone) so nothing jumps when data lands. */
export default function GeneralSettingsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading settings">
      <PageHeader title="Settings" />
      <div className="space-y-10">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <FormSkeleton>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldSkeleton />
              <FieldSkeleton />
            </div>
          </FormSkeleton>
          <FormSkeleton>
            <FieldSkeleton />
            <Skeleton className="mt-4 h-[66px] w-full rounded-2xl" />
          </FormSkeleton>
        </div>

        <div className="rounded-3xl border border-destructive/30 px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
          <Skeleton className="h-3 w-24" />
          <div className="mt-2 divide-y divide-destructive/15">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-4">
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-64 max-w-full" />
                </div>
                <Skeleton className="h-8 w-32 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
