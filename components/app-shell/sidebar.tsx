"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Logo, LogoMark } from "@/components/ui/logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { getNavGroups, isNavItemActive, type NavItem } from "./nav-config";
import { persistSidebarCollapsed } from "./sidebar-collapse";
import { planLabel, type ShellProps } from "./types";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

export interface SidebarProps extends ShellProps {
  /** Initial collapsed state (from the or_sidebar cookie, read on the server). */
  collapsed: boolean;
  /**
   * "rail" (default) is the sticky desktop sidebar with a collapse toggle;
   * "drawer" fills a mobile sheet and never collapses.
   */
  variant?: "rail" | "drawer";
  /** Called after a nav link is clicked — the mobile drawer uses it to close. */
  onNavigate?: () => void;
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-8 items-center rounded-md text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        collapsed ? "w-9 justify-center px-0" : "gap-2.5 px-2.5",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
      )}
    >
      {/* 2px black indicator on the leading edge of the active item. */}
      {active ? (
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-foreground",
            collapsed ? "-left-2" : "left-0",
          )}
        />
      ) : null}
      <Icon
        size={16}
        strokeWidth={active ? 2 : 1.75}
        className={cn("shrink-0", active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}
      />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function Sidebar({
  user,
  workspaces,
  activeWorkspaceId,
  role,
  isSuperAdmin,
  collapsed: initialCollapsed,
  variant = "rail",
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(variant === "drawer" ? false : initialCollapsed);
  const groups = React.useMemo(() => getNavGroups({ isSuperAdmin, role }), [isSuperAdmin, role]);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const showUpgrade = activeWorkspace ? activeWorkspace.plan !== "AGENCY" : false;

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    persistSidebarCollapsed(next);
  }

  const isRail = variant === "rail";
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleButton = isRail ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ToggleIcon size={16} strokeWidth={1.75} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{collapsed ? "Expand" : "Collapse"}</TooltipContent>
    </Tooltip>
  ) : null;

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        isRail && "sticky top-0 hidden h-screen transition-[width] duration-200 ease-in-out md:flex",
        isRail && (collapsed ? "w-14" : "w-64"),
        !isRail && "h-full w-full",
      )}
    >
      {/* Logo row */}
      <div className={cn("flex h-14 shrink-0 items-center", collapsed ? "flex-col justify-center gap-1 px-0" : "gap-2 px-4")}>
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Dashboard"
        >
          {collapsed ? <LogoMark size={26} /> : <Logo size={26} />}
        </Link>
        {collapsed ? null : <span className="flex-1" />}
        {collapsed ? null : toggleButton}
      </div>
      {collapsed && isRail ? <div className="flex justify-center pb-1">{toggleButton}</div> : null}

      {/* Workspace switcher */}
      <div className={cn("shrink-0 pb-2", collapsed ? "px-2.5" : "px-2")}>
        <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} collapsed={collapsed} />
      </div>

      {/* Navigation */}
      <nav
        aria-label="Primary"
        className={cn("scrollbar-thin flex-1 overflow-y-auto overflow-x-hidden py-1", collapsed ? "px-2.5" : "px-2")}
      >
        {groups.map((group, gi) => (
          <div key={group.id} className={cn(gi > 0 && "mt-4")}>
            {collapsed ? (
              gi > 0 ? <div className="mx-1 mb-2 h-px bg-sidebar-border" aria-hidden /> : null
            ) : (
              <p className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    active={isNavItemActive(pathname, item)}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer: plan + user */}
      <div className={cn("shrink-0 border-t border-sidebar-border py-2", collapsed ? "px-2.5" : "px-2")}>
        {activeWorkspace ? (
          collapsed ? (
            showUpgrade ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/settings/billing"
                    onClick={onNavigate}
                    aria-label={`${planLabel(activeWorkspace.plan)} plan — upgrade`}
                    className="mb-1 flex h-8 w-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Zap size={16} strokeWidth={1.75} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{planLabel(activeWorkspace.plan)} plan · Upgrade</TooltipContent>
              </Tooltip>
            ) : null
          ) : (
            <div className="mb-1 flex h-8 items-center justify-between px-2">
              <Badge variant="outline" className="bg-background">
                {planLabel(activeWorkspace.plan)}
              </Badge>
              {showUpgrade ? (
                <Link
                  href="/settings/billing"
                  onClick={onNavigate}
                  className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-4 hover:underline"
                >
                  <Zap size={12} strokeWidth={2} />
                  Upgrade
                </Link>
              ) : null}
            </div>
          )
        ) : null}
        <UserMenu user={user} isSuperAdmin={isSuperAdmin} collapsed={collapsed} />
      </div>
    </aside>
  );
}

export { Sidebar };
