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
  /** Match only the exact path: `/settings` itself has children. */
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

// ───────────────────────── Section tabs ─────────────────────────

export type SectionTab = {
  label: string;
  href: string;
  /** Match only the exact path, for a tab whose section root has children. */
  exact?: boolean;
  /** Hidden from MEMBER accounts, which cannot open the page anyway. */
  adminOnly?: boolean;
};

/**
 * The row of tabs that sits next to the page title, keyed by the section root.
 *
 * Only sections that genuinely have more than one page appear here: a lone tab
 * is noise, so `sectionTabs` returns nothing rather than a single chip.
 */
const SECTION_TABS: Record<string, readonly SectionTab[]> = {
  "/automations": [
    { label: "Automations", href: "/automations", exact: true },
    { label: "Templates", href: "/automations?templates=1" },
  ],
  "/contacts": [
    { label: "Contacts", href: "/contacts", exact: true },
    { label: "Pipelines", href: "/contacts/pipelines" },
  ],
  "/settings": [
    { label: "General", href: "/settings", exact: true },
    { label: "Workspaces", href: "/settings/workspaces" },
    { label: "Team", href: "/settings/team", adminOnly: true },
    { label: "Billing", href: "/settings/billing", adminOnly: true },
  ],
};

/** Tabs for the section the pathname belongs to, filtered by role. */
export function sectionTabs(pathname: string, role: WorkspaceRole): SectionTab[] {
  const admin = role === "OWNER" || role === "ADMIN";
  for (const [root, tabs] of Object.entries(SECTION_TABS)) {
    if (!isActivePath(pathname, root)) continue;
    const visible = tabs.filter((tab) => !tab.adminOnly || admin);
    return visible.length > 1 ? visible : [];
  }
  return [];
}
