"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Building2, ListChecks, Shield, Webhook, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type Item = { label: string; href: string; icon: LucideIcon; exact?: boolean };

const ITEMS: Item[] = [
  { label: "Overview", href: "/admin", icon: Shield, exact: true },
  { label: "Workspaces", href: "/admin/workspaces", icon: Building2 },
  { label: "Jobs", href: "/admin/jobs", icon: ListChecks },
  { label: "Webhooks", href: "/admin/webhooks", icon: Webhook },
  { label: "Health", href: "/admin/health", icon: Activity },
];

function isActive(pathname: string, item: Item): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Section tabs shown above every /admin page (rendered by app/(app)/admin/layout.tsx). */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="mb-6 flex items-end gap-4 border-b">
      <span className="hidden pb-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:block">
        Platform admin
      </span>
      <ul className="-mb-px flex items-center gap-1 overflow-x-auto">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-[13px] font-medium transition-colors",
                  active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
