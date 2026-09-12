"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronsUpDown, CreditCard, LogOut, Settings, Shield, Users } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, initials } from "@/lib/utils";

import type { ShellUser } from "./types";

export interface UserMenuProps {
  user: ShellUser;
  isSuperAdmin?: boolean;
  /** Icon-only trigger for the collapsed rail / mobile topbar. */
  collapsed?: boolean;
  /** Where the menu opens relative to the trigger. */
  side?: "top" | "right" | "bottom";
  className?: string;
}

function UserMenu({ user, isSuperAdmin = false, collapsed = false, side, className }: UserMenuProps) {
  const displayName = user.name?.trim() || user.email;

  const trigger = (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md text-left text-[13px] outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
        collapsed ? "h-9 justify-center px-0" : "h-10 px-2",
        className,
      )}
      aria-label={collapsed ? `Account: ${displayName}` : undefined}
    >
      <Avatar className="h-6 w-6">
        {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
        <AvatarFallback className="text-[10px]">{initials(user.name, user.email[0]?.toUpperCase() ?? "?")}</AvatarFallback>
      </Avatar>
      {collapsed ? null : (
        <>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate font-medium text-foreground">{displayName}</span>
            <span className="truncate text-[11px] text-muted-foreground">{user.email}</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </>
      )}
    </button>
  );

  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{displayName}</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      )}
      <DropdownMenuContent align="end" side={side ?? (collapsed ? "right" : "top")} className="w-56">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <span className="block truncate text-[13px] font-medium text-foreground">{displayName}</span>
          <span className="block truncate text-[11px] font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/team">
            <Users />
            Team
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/billing">
            <CreditCard />
            Billing
          </Link>
        </DropdownMenuItem>
        {isSuperAdmin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <Shield />
                Platform admin
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        {/* Plain anchor (not next/link) so the sign-out route is never prefetched. */}
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

export { UserMenu };
