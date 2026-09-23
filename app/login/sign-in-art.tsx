import { PlatformMark } from "@/components/ui/platform-badge";
import { cn } from "@/lib/utils";

/**
 * A comment and the DM it gets back, rising in one after the other. Drawn from
 * divs so it stays sharp; decorative, so hidden from assistive tech.
 */
export function SignInArt({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none select-none", className)}>
      <div className="w-full max-w-[340px]">
        <div className="rise" style={{ "--i": 3 } as React.CSSProperties}>
          <div className="flex -rotate-2 items-center gap-3 rounded-2xl bg-white p-4 text-ink shadow-[0_22px_40px_-26px_rgb(15_15_15/0.55)]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lavender text-[13px] font-semibold">SR</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] text-mute">
                <span className="font-semibold text-ink">sita.rai</span> commented
              </span>
              <span className="block text-[17px] font-semibold leading-tight">link</span>
            </span>
            <PlatformMark platform="INSTAGRAM" size={26} />
          </div>
        </div>

        <div className="rise ml-auto mt-4 w-[88%]" style={{ "--i": 10 } as React.CSSProperties}>
          <div className="rotate-[1.5deg] rounded-2xl rounded-tr-md bg-ink p-4 text-white shadow-[0_22px_40px_-26px_rgb(15_15_15/0.7)]">
            <span className="block text-[15px] leading-snug">Hi Sita, here’s the link you asked for.</span>
            <span className="mt-3 inline-flex h-9 items-center rounded-full bg-white px-4 text-[13px] font-semibold text-ink">
              Shop the collection
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
