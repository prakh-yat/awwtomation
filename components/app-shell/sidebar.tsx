"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Settings } from "lucide-react";

import { LogoMark, Wordmark } from "@/components/ui/logo";
import { TONES } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

import { isActivePath, PRIMARY_NAV, settingsLinks } from "./nav-config";
import type { ShellProps } from "./types";
import { UsageMeter } from "./usage-meter";
import { UserMenu } from "./user-menu";
import { WorkspaceCard, WorkspaceSwitcher } from "./workspace-switcher";

export interface SidebarProps extends ShellProps {
  /** Called after navigating, so the drawer closes itself. */
  onNavigate?: () => void;
}

/**
 * Navigation for narrow screens, shown in the drawer behind the header.
 *
 * Desktop uses the dock instead, so this is the labelled, always-expanded form:
 * it is the only navigation on a device with no pointer to sweep to the edge of
 * the window with.
 */
export function Sidebar({ user, organization, organizationCount, workspaces, activeWorkspaceId, role, usage, onNavigate }: SidebarProps) {
  const pathname = usePathname() ?? "";
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

  const rowClass = (active: boolean) =>
    cn(
      "group flex h-10 items-center gap-3 rounded-xl px-1.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
      active ? "bg-fog font-semibold text-ink" : "text-sidebar-foreground hover:bg-fog/70 hover:text-ink",
    );

  const iconClass = (active: boolean) =>
    cn("h-[18px] w-[18px] shrink-0", active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground");

  const tileClass = (tone: (typeof PRIMARY_NAV)[number]["tone"]) =>
    cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", TONES[tone].solid);

  return (
    <aside className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          aria-label="Dashboard"
          className="flex items-center gap-0.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogoMark size={28} />
          <Wordmark height={13} />
        </Link>
      </div>

      <div className="shrink-0 px-3 pb-3">
        <WorkspaceCard
          organizationName={organization.name}
          workspace={activeWorkspace}
          collapsed={false}
          onOpen={() => setSwitcherOpen(true)}
        />
      </div>

      <nav aria-label="Main" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-1">
        <ul className="flex flex-col gap-0.5">
          {PRIMARY_NAV.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={rowClass(active)}>
                  <span className={tileClass(item.tone)}>
                    <Icon className="h-4 w-4" strokeWidth={2} />
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}

          <li className="mt-2 border-t border-sidebar-border pt-2">
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={settingsOpen}
              aria-controls="sidebar-settings"
              className={cn("w-full text-left", rowClass(settingsActive && !settingsOpen))}
            >
              <span className={cn(tileClass("fog"), "border border-border")}>
                <Settings className={iconClass(settingsActive)} strokeWidth={2} />
              </span>
              <span className="flex-1">Settings</span>
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", settingsOpen && "rotate-180")}
              />
            </button>
            {settingsOpen ? (
              <ul id="sidebar-settings" className="mt-0.5 space-y-0.5 pl-[2.625rem]">
                {subLinks.map((link) => {
                  const active = isActivePath(pathname, link.href, link.exact);
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={onNavigate}
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
          </li>
        </ul>
      </nav>

      <div className="shrink-0 px-3 pb-3 pt-2">
        <UsageMeter usage={usage} collapsed={false} onNavigate={onNavigate} />
      </div>

      <div className="shrink-0 border-t border-sidebar-border px-3 py-2">
        <UserMenu
          user={user}
          organization={organization}
          canSwitchOrganization={organizationCount > 1}
          collapsed={false}
          side="top"
          onNavigate={onNavigate}
        />
      </div>

      <WorkspaceSwitcher
        organization={organization}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        canCreate={role === "OWNER" || role === "ADMIN"}
        collapsed={false}
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
        variant="drawer"
      />
    </aside>
  );
}
