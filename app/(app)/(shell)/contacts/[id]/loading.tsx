import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** A placeholder block for the green hero, where the grey shimmer would read as a hole. */
function HeroBone({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block rounded-lg bg-paper/60 motion-safe:animate-pulse", className)} />;
}

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <Skeleton className="h-3 w-20" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function ContactLoading() {
  return (
    <div aria-busy="true" aria-label="Loading contact">
      <PageHeader backHref="/contacts" backLabel="All contacts" title="Contacts" />

      <div className="mb-6 overflow-hidden rounded-3xl bg-green-soft">
        <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4 sm:gap-5">
            <HeroBone className="h-16 w-16 shrink-0 rounded-full" />
            <div className="space-y-3 pt-1">
              <HeroBone className="h-8 w-56 max-w-full" />
              <HeroBone className="h-4 w-44" />
              <HeroBone className="h-8 w-40 rounded-full" />
            </div>
          </div>
          <div className="flex gap-2">
            <HeroBone className="h-8 w-40 rounded-full" />
            <HeroBone className="h-8 w-8 rounded-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-ink/10 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2.5 px-5 py-4 sm:px-7">
              <HeroBone className="h-2.5 w-20" />
              <HeroBone className="h-5 w-12" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <PanelSkeleton rows={1} />
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={2} />
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-5 h-[124px] w-full rounded-2xl" />
          <div className="mt-5 flex gap-1.5">
            {[48, 64, 84, 96, 56].map((w, i) => (
              <Skeleton key={i} className="h-7 rounded-full" style={{ width: w }} />
            ))}
          </div>
          <div className="mt-6 space-y-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3.5">
                <Skeleton className="h-8 w-8 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2 pt-1">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
