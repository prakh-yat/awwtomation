import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

/**
 * The loading mark: the arrowhead hops off its lavender shadow and lands back
 * on it. It fades in after a beat so a fast load never flashes it, and holds
 * still when reduced motion is on.
 */
export function BrandLoader({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "relative inline-block animate-fade-in [animation-delay:150ms] [animation-fill-mode:both] motion-reduce:animate-none",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {/* The full mark with its ink layer made transparent: only the lavender shadow shows. */}
      <LogoMark size={size} className="absolute inset-0 block text-transparent" />
      {/* `animate-bounce` moves by a quarter of the box's height, so the box sets the hop. */}
      <span className="absolute inset-x-0 top-0 motion-safe:animate-bounce" style={{ height: Math.round(size * 0.5) }}>
        <LogoMark size={size} flat className="block text-ink" />
      </span>
    </span>
  );
}
