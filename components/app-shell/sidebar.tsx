"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Settings } from "lucide-react";

import { LogoMark, Wordmark } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { isBuilderPath } from "@/lib/workspace/request";

import { isActivePath, PRIMARY_NAV, settingsLinks } from "./nav-config";
import { useRailTooltip } from "./rail-tooltip";
import { persistSidebarCollapsed } from "./sidebar-collapse";
import type { ShellProps } from "./types";
import { UsageMeter } from "./usage-meter";
import { UserMenu } from "./user-menu";
import { WorkspaceCard, WorkspaceSwitcher } from "./workspace-switcher";

export interface SidebarProps extends ShellProps {
  /** Initial collapsed state, read from the cookie on the server so first paint is the right width. */
  collapsed: boolean;
  /** "rail" is the desktop sidebar; "drawer" fills the mobile sheet and never collapses. */
  variant?: "rail" | "drawer";
  /** Called after navigating — the mobile drawer closes itself with it. */
  onNavigate?: () => void;
}

export function Sidebar({
  user,
  organization,
  organizationCount,
  workspaces,
  activeWorkspaceId,
  role,
  usage,
  collapsed: initialCollapsed,
  variant = "rail",
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname() ?? "";
  const isRail = variant === "rail";
  const [preferCollapsed, setPreferCollapsed] = React.useState(isRail ? initialCollapsed : false);

  // The builder needs every pixel for its canvas, so the rail folds away there
  // without touching the saved preference. Expanding it there lasts until you leave.
  const focusMode = isRail && isBuilderPath(pathname);
  const [expandedInFocus, setExpandedInFocus] = React.useState(false);
  const [focusPath, setFocusPath] = React.useState(pathname);
  if (focusPath !== pathname) {
    setFocusPath(pathname);
    setExpandedInFocus(false);
  }
  const collapsed = focusMode ? !expandedInFocus : preferCollapsed;
  const rail = useRailTooltip(collapsed);

  const [switcherOpen, setSwitcherOpen] = React.useState(false);

  const settingsActive = isActivePath(pathname, "/settings");
  const [settingsOpen, setSettingsOpen] = React.useState(settingsActive);
  // Landing on a settings page from elsewhere (a link in a page, the user menu)
  // should reveal where you are.
  React.useEffect(() => {
    if (settingsActive) setSettingsOpen(true);
  }, [settingsActive]);

  const subLinks = React.useMemo(() => settingsLinks(role), [role]);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  function toggleCollapsed() {
    if (focusMode) {
      setExpandedInFocus((prev) => !prev);
    } else {
      setPreferCollapsed((prev) => {
        const next = !prev;
        persistSidebarCollapsed(next);
        return next;
      });
    }
    rail.hide();
  }

  function openSwitcher() {
    rail.hide();
    setSwitcherOpen(true);
  }

  function navigate() {
    rail.hide();
    onNavigate?.();
  }

  const rowClass = (active: boolean) =>
    cn(
      "group flex h-9 items-center rounded-lg text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
      collapsed ? "w-10 justify-center" : "gap-3 px-2.5",
      active
        ? "bg-sidebar-accent font-medium text-foreground"
        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
    );

  const iconClass = (active: boolean) =>
    cn("h-[18px] w-[18px] shrink-0", active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground");

  const content = (
    <>
      {isRail ? (
        // Sits half outside the rail so it never competes with a nav row for space.
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="absolute -right-3 top-1/2 z-30 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-sidebar-border bg-background text-muted-foreground shadow-card outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      ) : null}

      {/* Brand */}
      <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "justify-center" : "px-5")}>
        <Link
          href="/dashboard"
          onClick={navigate}
          aria-label="Dashboard"
          className="flex items-center gap-0.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogoMark size={28} />
          {collapsed ? null : <Wordmark height={13} />}
        </Link>
      </div>

      {/* Workspace */}
      <div className={cn("shrink-0 pb-3", collapsed ? "flex justify-center px-3" : "px-3")}>
        <WorkspaceCard
          organizationName={organization.name}
          workspace={activeWorkspace}
          collapsed={collapsed}
          onOpen={openSwitcher}
          railBind={rail.bind(activeWorkspace?.name ?? "Workspace")}
        />
      </div>

      {/* Navigation */}
      <nav aria-label="Main" className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto py-1", collapsed ? "px-3" : "px-3")}>
        <ul className={cn("flex flex-col gap-0.5", collapsed && "items-center")}>
          {PRIMARY_NAV.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={navigate}
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  {...rail.bind(item.label)}
                  className={rowClass(active)}
                >
                  <Icon className={iconClass(active)} strokeWidth={active ? 2 : 1.75} />
                  {collapsed ? null : <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            );
          })}

          <li className={cn("mt-2 pt-2", collapsed ? "border-t border-sidebar-border" : "border-t border-sidebar-border")}>
            {collapsed ? (
              // A nested list has nowhere to go at this width, so Settings is a plain link.
              <Link
                href="/settings"
                onClick={navigate}
                aria-label="Settings"
                {...rail.bind("Settings")}
                className={rowClass(settingsActive)}
              >
                <Settings className={iconClass(settingsActive)} strokeWidth={settingsActive ? 2 : 1.75} />
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSettingsOpen((v) => !v)}
                  aria-expanded={settingsOpen}
                  aria-controls="sidebar-settings"
                  className={cn("w-full text-left", rowClass(settingsActive && !settingsOpen))}
                >
                  <Settings className={iconClass(settingsActive)} strokeWidth={settingsActive ? 2 : 1.75} />
                  <span className="flex-1">Settings</span>
                  <ChevronDown
                    className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", settingsOpen && "rotate-180")}
                  />
                </button>
                {settingsOpen ? (
                  <ul id="sidebar-settings" className="mt-0.5 space-y-0.5 pl-[2.375rem]">
                    {subLinks.map((link) => {
                      const active = isActivePath(pathname, link.href, link.exact);
                      return (
                        <li key={link.href}>
                          <Link
                            href={link.href}
                            onClick={navigate}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex h-8 items-center rounded-md px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                              active
                                ? "bg-sidebar-accent font-medium text-foreground"
                                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                            )}
                          >
                            {link.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </>
            )}
          </li>
        </ul>
      </nav>

      {/* Usage */}
      <div className={cn("shrink-0 pb-3 pt-2", collapsed ? "px-3" : "px-3")}>
        <UsageMeter usage={usage} collapsed={collapsed} onNavigate={navigate} railBind={rail.bind("DMs this month")} />
      </div>

      {/* Account */}
      <div className={cn("shrink-0 border-t border-sidebar-border py-2", collapsed ? "flex justify-center px-3" : "px-3")}>
        <UserMenu
          user={user}
          organization={organization}
          canSwitchOrganization={organizationCount > 1}
          collapsed={collapsed}
          side={isRail ? "right" : "top"}
          onNavigate={navigate}
          railBind={rail.bind(user.name?.trim() || user.email)}
        />
      </div>

      <WorkspaceSwitcher
        organization={organization}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        canCreate={role === "OWNER" || role === "ADMIN"}
        collapsed={collapsed}
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
        variant={variant}
      />

      {rail.element}
    </>
  );

  if (!isRail) {
    return <aside className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">{content}</aside>;
  }

  // The outer column stretches with the page so the background and border run the
  // full height; the rail inside stays pinned to the viewport while content scrolls.
  return (
    <div
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "hidden shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out md:block",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <aside className="sticky top-0 flex h-screen flex-col text-sidebar-foreground">{content}</aside>
    </div>
  );
}
