import { ArrowRight, Heart, MessageCircle, Play, Send } from "lucide-react";

import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

/**
 * Static product mock for the hero: a reel receiving a "LINK" comment on the
 * left, the automated DM landing on the right. Pure divs, pure monochrome —
 * it must look like the product, not a stock illustration.
 */
function HeroMock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-5xl overflow-hidden rounded-xl border bg-background shadow-elevated",
        className,
      )}
      aria-label="Product preview: a comment on a reel triggers an automated direct message"
      role="img"
    >
      {/* Window chrome */}
      <div className="flex h-9 items-center gap-1.5 border-b bg-muted/60 px-3">
        <span className="h-2.5 w-2.5 rounded-full border bg-background" />
        <span className="h-2.5 w-2.5 rounded-full border bg-background" />
        <span className="h-2.5 w-2.5 rounded-full border bg-background" />
        <span className="ml-3 hidden h-5 flex-1 items-center rounded border bg-background px-2 font-mono text-[10px] text-muted-foreground sm:flex">
          automations / link-in-dm
        </span>
      </div>

      <div className="grid gap-6 p-5 sm:p-8 md:grid-cols-[1fr_auto_1fr] md:items-center">
        {/* Reel + comment */}
        <div className="mx-auto w-full max-w-xs">
          <div className="overflow-hidden rounded-lg border bg-card shadow-card">
            <div className="relative flex aspect-[4/5] items-center justify-center bg-muted">
              <div aria-hidden className="absolute inset-x-6 top-6 h-px bg-border" />
              <div aria-hidden className="absolute inset-x-6 bottom-12 h-px bg-border" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-full border bg-background shadow-card">
                <Play size={18} strokeWidth={2} className="ml-0.5" />
              </div>
              <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-foreground" />
                <span className="text-[11px] font-medium">@studio.north</span>
                <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Heart size={12} /> 2.4k
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MessageCircle size={12} /> 318
                </span>
              </div>
            </div>
            <div className="p-3">
              <p className="text-[12px] leading-5">
                <span className="font-medium">studio.north</span> Comment <span className="font-semibold">LINK</span> and I&apos;ll
                send you the full template 👇
              </p>
              <div className="mt-3 flex items-start gap-2 border-t pt-3">
                <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full border bg-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] leading-5">
                    <span className="font-medium">maya.creates</span> LINK
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Just now · Reply</p>
                </div>
                <span className="rounded-full border bg-background px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                  Matched
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Connector */}
        <div className="flex items-center justify-center md:flex-col md:gap-2">
          <div className="hidden h-px w-full border-t border-dashed md:block md:h-12 md:w-px md:border-l md:border-t-0" />
          <div className="flex h-9 items-center gap-2 rounded-full border bg-background px-3 text-[11px] font-medium shadow-card">
            <LogoMark size={16} />
            DM sent in 1.2s
            <ArrowRight size={12} className="text-muted-foreground" />
          </div>
          <div className="hidden h-px w-full border-t border-dashed md:block md:h-12 md:w-px md:border-l md:border-t-0" />
        </div>

        {/* DM thread */}
        <div className="mx-auto w-full max-w-xs">
          <div className="overflow-hidden rounded-lg border bg-card shadow-card">
            <div className="flex items-center gap-2 border-b px-3 py-2.5">
              <span className="h-7 w-7 rounded-full bg-foreground" />
              <div className="leading-tight">
                <p className="text-[12px] font-medium">studio.north</p>
                <p className="text-[10px] text-muted-foreground">Instagram · Active now</p>
              </div>
            </div>
            <div className="space-y-2.5 p-3">
              <div className="flex justify-end">
                <div className="max-w-[75%] rounded-2xl rounded-br-sm border bg-muted px-3 py-1.5 text-[12px]">LINK</div>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[85%] space-y-2">
                  <div className="rounded-2xl rounded-bl-sm bg-primary px-3 py-2 text-[12px] leading-5 text-primary-foreground">
                    Hey Maya! Thanks for commenting — here&apos;s the template you asked for 👇
                  </div>
                  <div className="overflow-hidden rounded-xl border">
                    <div className="flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-medium">
                      Open the template
                      <ArrowRight size={12} />
                    </div>
                  </div>
                  <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Send size={10} />
                    Delivered · Automated
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { HeroMock };
