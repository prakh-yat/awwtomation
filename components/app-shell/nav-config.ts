import type { WorkspaceRole } from "@prisma/client";
import {
  BarChart3,
  Inbox,
  LayoutDashboard,
  Link2,
  Megaphone,
  Plug,
  ScrollText,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type SettingsLink = {
  label: string;
  href: string;
  /** Match only the exact path — `/settings` itself has children. */
  exact?: boolean;
};

/**
 * Flat primary navigation, in the order people use the product: see how it's
 * going, build automations, talk to people, then the account plumbing.
 */
export const PRIMARY_NAV: readonly NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Automations", href: "/automations", icon: Workflow },
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Broadcasts", href: "/broadcasts", icon: Megaphone },
  { label: "Channels", href: "/channels", icon: Plug },
  { label: "Links", href: "/links", icon: Link2 },
  { label: "Logs", href: "/logs", icon: ScrollText },
];

/**
 * Settings sub-navigation, filtered by role so nobody sees a link to a page that
 * would send them back. The pages enforce the same rules on the server.
 */
export function settingsLinks(role: WorkspaceRole): SettingsLink[] {
  const admin = role === "OWNER" || role === "ADMIN";
  const links: SettingsLink[] = [
    { label: "General", href: "/settings", exact: true },
    { label: "Workspaces", href: "/settings/workspaces" },
  ];
  if (admin) {
    links.push({ label: "Team", href: "/settings/team" });
    links.push({ label: "Billing", href: "/settings/billing" });
  }
  return links;
}

export function isActivePath(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
