import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { stagger } from "@/components/charts/stagger";
import { Badge } from "@/components/ui/badge";
import type { AttentionItem, AttentionTone } from "@/lib/services/dashboard";
import { cn } from "@/lib/utils";

const TONE_DOT: Record<AttentionTone, string> = {
  critical: "bg-destructive",
  warning: "bg-orange",
  neutral: "bg-ink/35",
};

const TONE_LABEL: Record<AttentionTone, string> = {
  critical: "Urgent",
  warning: "Needs action",
  neutral: "To do",
};

/**
 * What to act on, most urgent first, one line each: the dot's colour says how
 * urgent, the words say what, and the link goes straight to where it is fixed.
 */
export function AttentionCard({ items, className }: { items: AttentionItem[]; className?: string }) {
  const critical = items.some((i) => i.tone === "critical");

  return (
    <section aria-labelledby="attention-title" className={cn("flex min-h-0 flex-col rounded-2xl border bg-card", className)}>
      <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
        <h2 id="attention-title" className="text-[15px] font-semibold leading-tight">
          Needs attention
        </h2>
        {items.length > 0 ? (
          <Badge variant={critical ? "destructive" : "secondary"} className="tabular-nums">
            {items.length}
          </Badge>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="flex items-center gap-2.5 px-4 pb-4 pt-1 text-[13px] text-muted-foreground">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-green" />
          Nothing needs your attention.
        </p>
      ) : (
        <ul className="scrollbar-thin max-h-[11.5rem] overflow-y-auto px-1.5 pb-1.5">
          {items.map((item, i) => (
            <li key={item.key} className="rise" style={stagger(i)}>
              <Link
                href={item.href}
                title={item.detail}
                className="group flex items-center gap-3 rounded-xl px-2.5 py-2.5 outline-none transition-colors hover:bg-fog focus-visible:bg-fog"
              >
                <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT[item.tone])} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                  <span className="sr-only">{TONE_LABEL[item.tone]}: </span>
                  {item.title}
                  <span className="sr-only">. {item.detail}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-muted-foreground transition-colors group-hover:text-ink">
                  {item.action}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
