"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { isTabActive, sectionFor, sectionTabs } from "@/components/app-shell/nav-config";
import { useShell } from "@/components/app-shell/shell-context";
import { TONES } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** The page's only heading. It stands alone: no page has a line of explanation under it. */
  title: React.ReactNode;
  /** Right-aligned actions (buttons, filters). */
  actions?: React.ReactNode;
  /** Renders a small "Back" link above the title. */
  backHref?: string;
  backLabel?: string;
}

function SectionTabs() {
  const shell = useShell();
  const pathname = usePathname() ?? "";
  const tabs = shell ? sectionTabs(pathname, shell.role) : [];
  if (tabs.length === 0) return null;
  // The current tab wears the section's colour, the same as the tile beside the title.
  const activeTone = TONES[sectionFor(pathname)?.tone ?? "ink"].solid;

  return (
    <nav aria-label="Section" className="scrollbar-none flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-full bg-fog p-1">
      {tabs.map((tab) => {
        const active = isTabActive(pathname, tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold outline-none transition-colors duration-150",
              "focus-visible:ring-2 focus-visible:ring-ring",
              active ? activeTone : "text-muted-foreground hover:bg-background hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The section's colour tile, so every page says where you are before you read it. */
function SectionTile() {
  const pathname = usePathname() ?? "";
  const section = sectionFor(pathname);
  if (!section) return null;
  const Icon = section.icon;
  return (
    <span aria-hidden className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", TONES[section.tone].solid)}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
    </span>
  );
}

/**
 * Every app page starts with this: the section's colour tile, the page's only
 * <h1>, the tabs for the section it belongs to, and whatever actions the page
 * offers, on one line.
 */
function PageHeader({ title, actions, backHref, backLabel = "Back", className, ...props }: PageHeaderProps) {
  return (
    <header className={cn("mb-7", className)} {...props}>
      {backHref ? (
        <Link
          href={backHref}
          className="group mb-3 inline-flex items-center gap-1.5 rounded-full py-1 pr-2 text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
          {backLabel}
        </Link>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <SectionTile />
          <h1 className="font-display truncate text-[28px] leading-none sm:text-[32px]">{title}</h1>
        </div>
        <SectionTabs />
        {actions ? (
          // Full width below sm so it wraps onto its own line instead of
          // squeezing the title.
          <div className="ml-auto flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

export { PageHeader };
