"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight, Building2, ChevronsUpDown, LifeBuoy, LogOut, Plus, Settings } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { brand } from "@/lib/brand";
import { cn, initials } from "@/lib/utils";

import { planLabel, type ShellOrganization, type ShellUser } from "./types";

export interface UserMenuProps {
  user: ShellUser;
  organization: ShellOrganization;
  /** Only people in more than one organization get "Switch organization". */
  canSwitchOrganization: boolean;
  collapsed?: boolean;
  /** Where the menu opens. The rail opens it to the right, like the workspace panel. */
  side?: "top" | "right" | "bottom";
  /** Called after following a link, so the mobile drawer can close. */
  onNavigate?: () => void;
  /** Told when the menu opens or closes, so the dock can stay out while it is up. */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/**
 * The account menu. Organizations are separate billable accounts, so creating
 * and switching them lives here; workspaces inside one are switched from the
 * card at the top of the sidebar.
 */
export function UserMenu({
  user,
  organization,
  canSwitchOrganization,
  collapsed = false,
  side = "right",
  onNavigate,
  onOpenChange,
  className,
}: UserMenuProps) {
  const displayName = user.name?.trim() || user.email;

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={collapsed ? `Account menu for ${displayName}` : undefined}
            className={cn(
            "flex w-full items-center rounded-lg text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-sidebar-accent",
            collapsed ? "h-10 justify-center px-0" : "gap-2.5 px-2 py-2",
            className,
          )}
        >
          <Avatar className="h-8 w-8 shrink-0">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
            <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">
              {initials(user.name, user.email[0]?.toUpperCase() ?? "?")}
            </AvatarFallback>
          </Avatar>
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium leading-tight text-foreground">{displayName}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{user.email}</span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" sideOffset={12} className="w-64 rounded-xl p-1.5">
        <DropdownMenuLabel className="px-2 py-1.5">
          <span className="block truncate text-[13px] font-medium text-foreground">{displayName}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" onClick={onNavigate}>
            <Settings />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`mailto:${brand.supportEmail}`}>
            <LifeBuoy />
            Contact support
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-foreground">{organization.name}</span>
            <span className="block text-xs text-muted-foreground">{planLabel(organization.plan)} plan</span>
          </span>
        </div>
        {canSwitchOrganization ? (
          <DropdownMenuItem asChild>
            <Link href="/organizations" onClick={onNavigate}>
              <ArrowLeftRight />
              Switch organization
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/organizations/new" onClick={onNavigate}>
            <Plus />
            Create organization
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* A plain anchor so the sign-out route is never prefetched. */}
        <DropdownMenuItem asChild>
          <a href="/auth/signout">
            <LogOut />
            Sign out
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
