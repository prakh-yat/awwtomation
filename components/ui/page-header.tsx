"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { isActivePath, sectionTabs } from "@/components/app-shell/nav-config";
import { useShell } from "@/components/app-shell/shell-context";
import { cn } from "@/lib/utils";

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  /**
   * Reserved for the dashboard, which is the one page that has to explain what
   * to do before anything is connected. Every other page carries its title alone.
   */
  description?: React.ReactNode;
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

  return (
    <nav aria-label="Section" className="scrollbar-thin -mb-3 flex min-w-0 items-center gap-1 overflow-x-auto pb-3">
      {tabs.map((tab) => {
        // A tab can point at a query string (Templates opens a dialog); the path
        // in front of it is what decides whether it reads as the current page.
        const [path] = tab.href.split("?");
        const hasQuery = tab.href.includes("?");
        const active = !hasQuery && isActivePath(pathname, path, tab.exact);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring",
              active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {active ? <span aria-hidden className="absolute inset-x-3 -bottom-3 h-0.5 rounded-full bg-foreground" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Every app page starts with this: the page's only <h1>, the tabs for the
 * section it belongs to, and whatever actions the page offers, all on one line
 * above a rule that separates the chrome from the content.
 */
function PageHeader({ title, description, actions, backHref, backLabel = "Back", className, ...props }: PageHeaderProps) {
  return (
    <header className={cn("-mx-5 mb-6 border-b px-5 pb-3 md:-mx-8 md:px-8", className)} {...props}>
      {backHref ? (
        <Link
          href={backHref}
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLabel}
        </Link>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="font-display shrink-0 text-[26px] leading-none">{title}</h1>
        <SectionTabs />
        {actions ? (
          // Full width below sm so it wraps onto its own line instead of
          // colliding with the tab underline.
          <div className="ml-auto flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">{actions}</div>
        ) : null}
      </div>

      {description ? <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
    </header>
  );
}

export { PageHeader };
