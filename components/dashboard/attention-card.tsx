import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttentionItem, AttentionTone } from "@/lib/services/dashboard";
import { cn } from "@/lib/utils";

const TONE_BAR: Record<AttentionTone, string> = {
  critical: "bg-destructive",
  warning: "bg-warning",
  neutral: "bg-foreground/25",
};

const TONE_LABEL: Record<AttentionTone, string> = {
  critical: "Urgent",
  warning: "Needs action",
  neutral: "To do",
};

export function AttentionCard({ items }: { items: AttentionItem[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>Needs attention</CardTitle>
        {items.length > 0 ? <span className="text-xs tabular-nums text-muted-foreground">{items.length}</span> : null}
      </CardHeader>
      {items.length === 0 ? (
        <p className="border-t px-5 py-6 text-[13px] text-muted-foreground">Nothing needs your attention right now.</p>
      ) : (
        <ul className="divide-y border-t">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="group relative flex items-center gap-3 py-3.5 pl-5 pr-4 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/60"
              >
                <span className={cn("absolute inset-y-3 left-0 w-[3px] rounded-r-full", TONE_BAR[item.tone])} aria-hidden />
                <span className="sr-only">{TONE_LABEL[item.tone]}: </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium leading-5">{item.title}</span>
                  <span className="mt-0.5 block text-xs leading-[18px] text-muted-foreground">{item.detail}</span>
                </span>
                <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                  {item.action}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
