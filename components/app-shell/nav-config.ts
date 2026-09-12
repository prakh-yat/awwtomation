import type { WorkspaceRole } from "@prisma/client";
import {
  Activity,
  BarChart3,
  Building2,
  CreditCard,
  Inbox,
  LayoutDashboard,
  Link2,
  ListChecks,
  Megaphone,
  Plug,
  ScrollText,
  Settings,
  Shield,
  Users,
  Webhook,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Match only the exact path (for section roots like /settings that have children). */
  exact?: boolean;
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const MAIN: NavGroup = {
  id: "main",
  label: "Main",
  items: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Analytics", href: "/analytics", icon: BarChart3 },
    { label: "Automations", href: "/automations", icon: Workflow },
    { label: "Inbox", href: "/inbox", icon: Inbox },
    { label: "Contacts", href: "/contacts", icon: Users },
    { label: "Broadcasts", href: "/broadcasts", icon: Megaphone },
  ],
};

const SETUP: NavGroup = {
  id: "setup",
  label: "Setup",
  items: [
    { label: "Channels", href: "/channels", icon: Plug },
    { label: "Links", href: "/links", icon: Link2 },
    { label: "Logs", href: "/logs", icon: ScrollText },
  ],
};

const SETTINGS_ALL: NavItem[] = [
  { label: "General", href: "/settings", icon: Settings, exact: true },
  { label: "Team", href: "/settings/team", icon: Users },
  { label: "Billing", href: "/settings/billing", icon: CreditCard },
];

const ADMIN: NavGroup = {
  id: "admin",
  label: "Admin",
  items: [
    { label: "Overview", href: "/admin", icon: Shield, exact: true },
    { label: "Workspaces", href: "/admin/workspaces", icon: Building2 },
    { label: "Jobs", href: "/admin/jobs", icon: ListChecks },
    { label: "Webhooks", href: "/admin/webhooks", icon: Webhook },
    { label: "Health", href: "/admin/health", icon: Activity },
  ],
};

export type NavOptions = {
  isSuperAdmin: boolean;
  role: WorkspaceRole;
};

/**
 * Nav groups per ARCHITECTURE §7. Team/billing are ADMIN+ concerns so members
 * don't see links to pages that would 403; the admin group is platform-only.
 */
export function getNavGroups({ isSuperAdmin, role }: NavOptions): NavGroup[] {
  const settingsItems = role === "MEMBER" ? SETTINGS_ALL.filter((i) => i.exact) : SETTINGS_ALL;
  const groups: NavGroup[] = [MAIN, SETUP, { id: "settings", label: "Settings", items: settingsItems }];
  if (isSuperAdmin) groups.push(ADMIN);
  return groups;
}

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
