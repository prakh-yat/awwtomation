import * as React from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

export type FaqItem = { question: string; answer: React.ReactNode };

/**
 * Native <details> disclosure: keyboard and screen-reader friendly with no
 * client JavaScript, and the answers stay in the HTML for search engines.
 */
function FaqList({ items, className }: { items: FaqItem[]; className?: string }) {
  return (
    <div className={cn("border-t", className)}>
      {items.map((item) => (
        <details key={item.question} className="group border-b [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 rounded-sm py-5 text-[16px] font-medium leading-snug text-foreground outline-none transition-colors hover:text-foreground/75 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4">
            {item.question}
            <Plus
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45"
              strokeWidth={2}
            />
          </summary>
          <div className="-mt-1 max-w-2xl pb-6 pr-10 text-[15px] leading-[1.7] text-muted-foreground [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4">
            {item.answer}
          </div>
        </details>
      ))}
    </div>
  );
}

export { FaqList };
