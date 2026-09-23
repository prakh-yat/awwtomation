import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-lg bg-[linear-gradient(90deg,hsl(0_0%_95%)_0%,hsl(0_0%_91%)_50%,hsl(0_0%_95%)_100%)] bg-[length:200%_100%] motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
