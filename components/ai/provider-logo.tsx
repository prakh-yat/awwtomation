import { Braces } from "lucide-react";

import type { ProviderPreset } from "@/lib/ai/presets";
import { cn } from "@/lib/utils";

/** A provider's own logo on a white tile, the same everywhere it appears. A custom endpoint gets braces. */
export function ProviderLogo({ preset, size = 32, className }: { preset: ProviderPreset; size?: number; className?: string }) {
  const inner = Math.round(size * 0.6);
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center ring-1 ring-inset ring-ink/10", preset.logo ? "bg-white" : "bg-fog text-ink", className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
    >
      {preset.logo ? (
        // A static file from /public: next/image would add nothing for an SVG this small.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preset.logo} alt="" width={inner} height={inner} draggable={false} decoding="async" className="pointer-events-none select-none" />
      ) : (
        <Braces style={{ width: size * 0.46, height: size * 0.46 }} strokeWidth={2.25} />
      )}
    </span>
  );
}
