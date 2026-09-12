import { Spinner } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <Spinner />
    </div>
  );
}
