import type { WorkspaceRole } from "@prisma/client";
import {
  BarChart3,
  BotMessageSquare,
  Inbox,
  LayoutDashboard,
  Link2,
  Megaphone,
  ScrollText,
  Settings,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import type { Tone } from "@/components/ui/tone";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** The section's colour: its dock tile and the tile next to its page title. */
  tone: Tone;
};

export type SettingsLink = {
  label: string;
  href: string;
  /** Match only the exact path: `/settings` itself has children. */
  exact?: boolean;
};

/**
 * Flat primary navigation, in the order people use the product: see how it's
 * going, build automations, then talk to people. Connected accounts are managed
 * from the dashboard, and settings from the account menu.
 */
export const PRIMARY_NAV: readonly NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, tone: "yellow" },
  { label: "Analytics", href: "/analytics", icon: BarChart3, tone: "blue" },
  { label: "Automations", href: "/automations", icon: Workflow, tone: "purple" },
  { label: "AI", href: "/ai", icon: BotMessageSquare, tone: "ink" },
  { label: "Inbox", href: "/inbox", icon: Inbox, tone: "magenta" },
  { label: "Contacts", href: "/contacts", icon: Users, tone: "green" },
  { label: "Broadcasts", href: "/broadcasts", icon: Megaphone, tone: "orange" },
  { label: "Links", href: "/links", icon: Link2, tone: "sky" },
  { label: "Logs", href: "/logs", icon: ScrollText, tone: "lavender" },
];

export const SETTINGS_NAV: NavItem = { label: "Settings", href: "/settings", icon: Settings, tone: "fog" };

/**
 * The section a pathname belongs to, for the tile next to a page title. Usage
 * sits with Settings, and the Facebook Page picker with the dashboard, where
 * accounts are managed.
 */
export function sectionFor(pathname: string): NavItem | null {
  const primary = PRIMARY_NAV.find((item) => isActivePath(pathname, item.href));
  if (primary) return primary;
  if (isActivePath(pathname, "/channels")) return PRIMARY_NAV[0];
  if (isActivePath(pathname, "/settings") || isActivePath(pathname, "/usage")) return SETTINGS_NAV;
  return null;
}

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
  /** Paths under this tab that belong to a sibling tab instead. */
  exclude?: readonly string[];
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
  "/contacts": [
    { label: "Contacts", href: "/contacts", exclude: ["/contacts/pipelines"] },
    { label: "Pipelines", href: "/contacts/pipelines" },
  ],
  "/settings": [
    { label: "General", href: "/settings", exact: true },
    { label: "Workspaces", href: "/settings/workspaces" },
    { label: "Team", href: "/settings/team", adminOnly: true },
    { label: "Billing", href: "/settings/billing", adminOnly: true },
  ],
};

/** Whether a tab reads as the current page: its path, minus what a sibling tab owns. */
export function isTabActive(pathname: string, tab: SectionTab): boolean {
  if (!isActivePath(pathname, tab.href, tab.exact)) return false;
  return !(tab.exclude ?? []).some((other) => isActivePath(pathname, other));
}

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
