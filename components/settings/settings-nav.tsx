"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type SettingsTab = {
  label: string;
  href: string;
  /** Match only the exact path — the General tab must not light up on /settings/team. */
  exact?: boolean;
};

/**
 * Underline-style section tabs rendered as real links so each settings page
 * stays a server component with its own URL, loading state and metadata.
 */
export function SettingsNav({ tabs }: { tabs: SettingsTab[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className="mb-6 border-b">
      <ul className="-mb-px flex gap-6">
        {tabs.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center border-b-2 text-[13px] font-medium transition-colors",
                  active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
