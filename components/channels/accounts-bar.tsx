"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ChannelPlatform } from "@prisma/client";
import { ArrowUpRight, Plus } from "lucide-react";

import { OPEN_CONNECT_EVENT } from "@/components/app-shell/tour-events";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlatformMark } from "@/components/ui/platform-badge";
import { toast } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChannelView } from "@/lib/services/channels";
import { cn, initials } from "@/lib/utils";

import { AccountRow } from "./account-row";
import { AccountSetupDialog } from "./account-setup-dialog";
import { channelDisplayName, channelStatusView, connectHref } from "./channel-status";
import { ConnectButtons, type MetaConfigured } from "./connect-buttons";

/** Messages keyed by the `?error=` values produced by app/api/meta/* and the select route. */
const ERROR_MESSAGES: Record<string, string> = {
  denied: "Connection cancelled. Try again when you're ready.",
  plan_limit: "Your plan has no room for another account. Disconnect one or upgrade.",
  not_configured: "Connecting accounts isn't available right now. Try again later.",
  invalid_state: "That sign-in link expired. Connect again.",
  session: "Another user started this connection. Sign in with that account and try again.",
  forbidden: "Only workspace admins can connect accounts.",
  meta: "Instagram or Facebook couldn't finish connecting. Try again.",
  channel_claimed: "This account is connected to another workspace. Disconnect it there first.",
  platform_taken: "A workspace holds one Instagram account and one Facebook Page.",
  one_page: "Choose one Page. A workspace connects one Facebook Page.",
  no_pages: "No Page was shared. Connect again, choose Edit settings and tick your Page.",
  fb_session_expired: "Your Facebook sign-in timed out before you picked a Page. Connect again.",
  page_not_found: "One of those Pages is no longer on your Facebook account. Sign in again.",
  unknown: "Something went wrong while connecting. Try again.",
};

/** Query flags the OAuth callbacks and other pages use to talk to this bar; read once, then dropped from the URL. */
const CONSUMED_PARAMS = ["accounts", "connected", "error", "message", "platform"];

const PLATFORMS: ReadonlyArray<{ platform: ChannelPlatform; label: string; hint: string }> = [
  { platform: "INSTAGRAM", label: "Instagram", hint: "Business or creator account" },
  { platform: "FACEBOOK", label: "Facebook Page", hint: "A Page you manage" },
];

/** Platforms that already have a live account here: a workspace holds one of each. */
function takenPlatforms(channels: ChannelView[]): Set<ChannelPlatform> {
  return new Set(channels.filter((c) => c.status !== "DISCONNECTED").map((c) => c.platform));
}

/** Most accounts a workspace shows as faces before the rest collapse into "+n". */
const VISIBLE = 4;

/** The dot on a face: nothing when all is well, the status colour when it is not. */
const PROBLEM_DOT: Record<string, string> = { warning: "bg-orange", destructive: "bg-destructive" };

export interface AccountsBarProps {
  channels: ChannelView[];
  configured: MetaConfigured;
  /** ADMIN+: connect, reconnect and disconnect. */
  canManage: boolean;
  /** OWNER: delete an account with its data. */
  canPurge: boolean;
  slots: { used: number; limit: number };
  planLabel: string;
  /** May change the plan, for the upgrade link when the plan is full. */
  canUpgrade: boolean;
}

function ConnectMenu({
  configured,
  platforms,
  full,
  canUpgrade,
}: {
  configured: MetaConfigured;
  platforms: typeof PLATFORMS;
  full: boolean;
  canUpgrade: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  // "Connect now" in the product tour opens this menu.
  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_CONNECT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CONNECT_EVENT, onOpen);
  }, []);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="shrink-0" data-tour="connect">
          <Plus /> Connect
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {full ? (
          <>
            <DropdownMenuLabel className="text-[13px] font-medium text-muted-foreground">Your plan has no room for another account.</DropdownMenuLabel>
            {canUpgrade ? (
              <DropdownMenuItem asChild>
                <Link href="/settings/billing">
                  <ArrowUpRight /> Upgrade plan
                </Link>
              </DropdownMenuItem>
            ) : null}
          </>
        ) : (
          platforms.map((option) => {
            const ready = option.platform === "INSTAGRAM" ? configured.instagram : configured.facebook;
            return (
              <DropdownMenuItem key={option.platform} asChild disabled={!ready} className="gap-3 py-2">
                {/* A plain anchor: the target is a route handler that redirects to Meta, never something to prefetch. */}
                <a href={ready ? connectHref(option.platform) : undefined} aria-disabled={!ready || undefined}>
                  <PlatformMark aria-hidden platform={option.platform} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{option.label}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">{ready ? option.hint : "Unavailable right now"}</span>
                  </span>
                </a>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The connected accounts, as faces next to the dashboard's title, and the way
 * to add another. Everything else about an account (its posts, reconnecting,
 * disconnecting) is one click away in the dialog behind the faces.
 */
export function AccountsBar({ channels, configured, canManage, canPurge, slots, planLabel, canUpgrade }: AccountsBarProps) {
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  // Newly connected accounts still to be asked about, first one on screen.
  const [setupQueue, setSetupQueue] = React.useState<string[]>([]);
  // Strict mode runs effects twice in development; a toast must still fire once.
  const handled = React.useRef<string | null>(null);

  const full = slots.limit > 0 && slots.used >= slots.limit;
  const taken = takenPlatforms(channels);
  const available = PLATFORMS.filter((option) => !taken.has(option.platform));
  const visible = channels.slice(0, VISIBLE);
  const hidden = channels.length - visible.length;

  // `?accounts=1` opens the dialog (links from elsewhere in the app), and the
  // OAuth callbacks land here with `?connected=` or `?error=`. Each becomes a
  // dialog or a toast once, then leaves the URL so a reload does not repeat it.
  React.useEffect(() => {
    const key = searchParams.toString();
    if (!CONSUMED_PARAMS.some((param) => searchParams.has(param))) {
      // Cleared, so the same link followed again opens the dialog again.
      handled.current = null;
      return;
    }
    if (handled.current === key) return;
    handled.current = key;

    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    const message = searchParams.get("message");

    if (connected) {
      const ids = connected.split(",").filter(Boolean);
      const matched = ids.map((id) => channels.find((c) => c.id === id)).filter((c): c is ChannelView => Boolean(c));
      if (matched.length === 1) toast.success(`Connected ${channelDisplayName(matched[0])}`);
      else toast.success(`Connected ${ids.length} account${ids.length === 1 ? "" : "s"}`);
      // Then a few questions about each account that has not had them, one account at a time.
      // A reconnected account answered them the first time round.
      const unasked = matched.filter((c) => !c.setup.complete).map((c) => c.id);
      if (canManage && unasked.length > 0) setSetupQueue(unasked);
    }
    if (error) toast.error(ERROR_MESSAGES[error] ?? ERROR_MESSAGES.unknown, message ? { description: message } : undefined);
    if (searchParams.get("accounts") === "1" || error) {
      setFocusId(null);
      setOpen(true);
    }

    const next = new URLSearchParams(searchParams);
    for (const param of CONSUMED_PARAMS) next.delete(param);
    const query = next.toString();
    window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }, [searchParams, channels, canManage]);

  const setupChannel = setupQueue.map((id) => channels.find((c) => c.id === id)).find((c): c is ChannelView => Boolean(c)) ?? null;

  function openFor(id: string | null) {
    setFocusId(id);
    setOpen(true);
  }

  return (
    <>
      <div data-tour="accounts" className="flex items-center gap-2">
        {channels.length > 0 ? (
          <div className="flex items-center" role="group" aria-label="Connected accounts">
            {visible.map((channel, i) => {
              const status = channelStatusView(channel);
              const name = channelDisplayName(channel);
              return (
                <Tooltip key={channel.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => openFor(channel.id)}
                      aria-label={`${name}, ${status.label}`}
                      className={cn(
                        "relative shrink-0 rounded-full outline-none transition-transform duration-200 ease-soft hover:z-10 hover:-translate-y-0.5 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        i > 0 && "-ml-2",
                      )}
                    >
                      <Avatar className={cn("h-9 w-9 border-2 border-background", channel.status === "DISCONNECTED" && "opacity-60 grayscale")}>
                        {channel.avatarUrl ? <AvatarImage src={channel.avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
                        <AvatarFallback className="text-[11px]">{initials(channel.name ?? channel.username, channel.platform[0])}</AvatarFallback>
                      </Avatar>
                      <PlatformMark aria-hidden platform={channel.platform} size={15} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-background" />
                      {PROBLEM_DOT[status.variant] ? (
                        <span aria-hidden className={cn("absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background", PROBLEM_DOT[status.variant])} />
                      ) : null}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <span className="font-semibold">{name}</span>
                    {status.variant === "success" ? null : <span className="text-white/70"> · {status.label}</span>}
                  </TooltipContent>
                </Tooltip>
              );
            })}
            {hidden > 0 ? (
              <button
                type="button"
                onClick={() => openFor(null)}
                aria-label={`${hidden} more accounts`}
                className="-ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-background bg-fog text-[12px] font-semibold tabular-nums outline-none transition-colors hover:bg-[hsl(0_0%_91%)] focus-visible:ring-2 focus-visible:ring-ring"
              >
                +{hidden}
              </button>
            ) : null}
          </div>
        ) : null}
        {canManage && available.length > 0 ? <ConnectMenu configured={configured} platforms={available} full={full} canUpgrade={canUpgrade} /> : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Accounts</DialogTitle>
            <DialogDescription className="tabular-nums">
              {slots.used} of {slots.limit} on the {planLabel} plan
            </DialogDescription>
          </DialogHeader>

          {channels.length > 0 ? (
            <ul className="space-y-2">
              {channels.map((channel, i) => (
                <AccountRow
                  key={channel.id}
                  channel={channel}
                  canManage={canManage}
                  canPurge={canPurge}
                  // A disconnected account can't come back while another one holds its platform here.
                  canReconnect={channel.status !== "DISCONNECTED" || !taken.has(channel.platform)}
                  highlighted={channel.id === focusId}
                  index={i}
                />
              ))}
            </ul>
          ) : null}

          {!canManage ? (
            <p className="text-[13px] text-muted-foreground">Only workspace admins can connect or disconnect accounts.</p>
          ) : available.length === 0 ? null : full ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-fog px-4 py-3">
              <p className="text-[13px] font-medium">Your plan has no room for another account.</p>
              {canUpgrade ? (
                <Button asChild size="sm" variant="highlight">
                  <Link href="/settings/billing">Upgrade plan</Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <section aria-labelledby="connect-another" className="space-y-2.5">
              <h3 id="connect-another" className="brand-label text-muted-foreground">
                {channels.length > 0 ? "Connect another" : "Connect an account"}
              </h3>
              <ConnectButtons configured={configured} platforms={available.map((option) => option.platform)} />
            </section>
          )}
        </DialogContent>
      </Dialog>

      {setupChannel ? (
        <AccountSetupDialog
          key={setupChannel.id}
          channel={setupChannel}
          mode="connect"
          open
          onDone={() => setSetupQueue((queue) => queue.filter((id) => id !== setupChannel.id))}
        />
      ) : null}
    </>
  );
}
