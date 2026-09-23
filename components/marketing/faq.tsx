import * as React from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

export type FaqItem = { question: string; answer: React.ReactNode };

/**
 * Native <details> disclosure: keyboard and screen-reader friendly with no
 * client JavaScript, and the answers stay in the HTML for search engines.
 * `dark` sets it for an ink block, as the site does with its questions.
 */
function FaqList({ items, dark = false, className }: { items: FaqItem[]; dark?: boolean; className?: string }) {
  const rule = dark ? "border-white/20" : "border-border";
  return (
    <div className={cn("border-t", rule, className)}>
      {items.map((item) => (
        <details key={item.question} className={cn("group border-b [&_summary::-webkit-details-marker]:hidden", rule)}>
          <summary
            className={cn(
              "flex cursor-pointer list-none items-start justify-between gap-6 rounded-lg py-5 text-[17px] font-semibold leading-snug outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 sm:py-6 sm:text-[19px]",
              dark ? "text-white hover:text-white/80 focus-visible:ring-offset-ink" : "text-ink hover:text-ink/70",
            )}
          >
            {item.question}
            <span
              aria-hidden
              className={cn(
                "-mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full transition-[transform,background-color,color] duration-300 ease-soft group-open:rotate-45 group-open:bg-yellow group-open:text-ink motion-reduce:transition-none",
                dark ? "bg-white/10 text-white" : "bg-fog text-ink",
              )}
            >
              <Plus className="size-4" strokeWidth={2.25} />
            </span>
          </summary>
          <div
            className={cn(
              "-mt-1 max-w-2xl pb-7 pr-12 text-[15px] leading-[1.7] sm:text-[16px]",
              "[&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-4",
              dark ? "text-white/70 [&_a]:text-white" : "text-muted-foreground [&_a]:text-ink",
            )}
          >
            {item.answer}
          </div>
        </details>
      ))}
    </div>
  );
}

export { FaqList };
