import Link from "next/link";

import { cn } from "@/lib/utils";

export type FilterLink = { label: string; href: string; active: boolean };

/** Segmented control made of links, for server-rendered list filters. */
export function FilterLinks({ items, label }: { items: FilterLink[]; label: string }) {
  return (
    <nav aria-label={label} className="inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "inline-flex items-center rounded-md px-3 py-1 text-[13px] font-medium transition-colors",
            item.active ? "bg-background text-foreground shadow-sm" : "hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
