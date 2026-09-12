import { Skeleton } from "@/components/ui/skeleton";

export default function BuilderLoading() {
  return (
    <div className="-mx-6 -my-6 flex h-[calc(100vh-3.5rem)] flex-col md:h-screen lg:-mx-8">
      <div className="flex h-14 items-center gap-3 border-b px-4">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-5 w-14 rounded-full" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-[380px] space-y-5 border-r p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
        <div className="flex flex-1 items-center justify-center bg-[#fafafa]">
          <div className="flex flex-col items-center gap-8">
            <Skeleton className="h-20 w-60 bg-white" />
            <Skeleton className="h-28 w-60 bg-white" />
          </div>
        </div>
        <div className="w-[360px] space-y-4 border-l p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mx-auto h-[480px] w-[272px] rounded-[30px]" />
        </div>
      </div>
    </div>
  );
}
