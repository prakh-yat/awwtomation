import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function ContactsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading contacts">
      <PageHeader
        title="Contacts"
        actions={
          <>
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-32 rounded-full" />
          </>
        }
      />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-full rounded-full sm:w-64" />
          <Skeleton className="h-9 w-9 rounded-full" />
          {[92, 84, 72, 84].map((w, i) => (
            <Skeleton key={i} className="h-8 rounded-full" style={{ width: w }} />
          ))}
          <Skeleton className="ml-auto h-8 w-44 rounded-full" />
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="border-b bg-fog/60 px-4 py-3.5">
            <Skeleton className="h-2.5 w-full max-w-md" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
              <Skeleton className="h-[18px] w-[18px] rounded-md" />
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40 max-w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="hidden h-4 w-28 lg:block" />
              <Skeleton className="hidden h-5 w-16 rounded-full md:block" />
              <Skeleton className="hidden h-3.5 w-16 sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
