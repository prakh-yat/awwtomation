"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Images, MoreHorizontal, RefreshCw, Trash2, Unplug } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { toast } from "@/components/ui/sonner";
import type { ChannelView } from "@/lib/services/channels";
import { cn, formatNumber, initials } from "@/lib/utils";

import { apiFetch, errorMessage } from "./api";
import { channelDisplayName, channelStatusView, connectHref, PLATFORM_LABEL } from "./channel-status";
import { MediaDialog } from "./media-dialog";

export interface ChannelCardProps {
  channel: ChannelView;
  /** ADMIN+; gates disconnect/reconnect. Refresh and viewing posts are open to every member. */
  canManage: boolean;
  /** OWNER only; gates the irreversible "Delete channel & data" action. */
  canPurge?: boolean;
}

export function ChannelCard({ channel, canManage, canPurge = false }: ChannelCardProps) {
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);
  const [mediaOpen, setMediaOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [purgeOpen, setPurgeOpen] = React.useState(false);

  const status = channelStatusView(channel);
  const name = channelDisplayName(channel);
  const disconnected = channel.status === "DISCONNECTED";

  async function refresh() {
    setRefreshing(true);
    try {
      await apiFetch(`/api/channels/${channel.id}/refresh`, { method: "POST" });
      toast.success(`Refreshed ${name}`, { description: "Profile details and posts are up to date." });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't refresh this account"));
    } finally {
      setRefreshing(false);
    }
  }

  async function disconnect() {
    try {
      await apiFetch(`/api/channels/${channel.id}`, { method: "DELETE" });
      toast.success(`Disconnected ${name}`, { description: "Automations on this account are off until you reconnect it." });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't disconnect this account"));
      throw err; // keeps the confirm dialog open
    }
  }

  return (
    <article className={cn("flex flex-col rounded-lg border bg-card shadow-card", disconnected && "opacity-80")}>
      <header className="flex items-start gap-3 p-5">
        <Avatar className="h-10 w-10 border">
          {channel.avatarUrl ? <AvatarImage src={channel.avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
          <AvatarFallback>{initials(channel.name ?? channel.username, channel.platform[0])}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-sm font-medium">{name}</h3>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <PlatformIcon platform={channel.platform} size={12} />
            <span>{PLATFORM_LABEL[channel.platform]}</span>
            {channel.followerCount !== null ? (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{formatNumber(channel.followerCount)} followers</span>
              </>
            ) : null}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="-mr-2 -mt-1.5 h-8 w-8" aria-label={`Actions for ${name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => void refresh()} disabled={refreshing || disconnected}>
              <RefreshCw className={cn(refreshing && "animate-spin")} />
              Refresh
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMediaOpen(true)} disabled={disconnected}>
              <Images />
              View posts
            </DropdownMenuItem>
            {canManage ? (
              <>
                <DropdownMenuSeparator />
                {status.needsReconnect || channel.health.state === "expiring" ? (
                  <DropdownMenuItem asChild>
                    <a href={connectHref(channel.platform)}>
                      <PlatformIcon platform={channel.platform} />
                      Reconnect
                    </a>
                  </DropdownMenuItem>
                ) : null}
                {!disconnected ? (
                  <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
                    <Unplug />
                    Disconnect
                  </DropdownMenuItem>
                ) : null}
                {canPurge ? (
                  <DropdownMenuItem destructive onSelect={() => setPurgeOpen(true)}>
                    <Trash2 />
                    Delete account and data
                  </DropdownMenuItem>
                ) : null}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <dl className="grid grid-cols-3 divide-x border-y">
        <Stat label="Automations" value={channel.counts.automations} />
        <Stat label="Contacts" value={channel.counts.contacts} />
        <Stat label="DMs this week" value={channel.counts.dms7d} />
      </dl>

      <div className="flex-1 px-5 py-3 text-xs">
        {status.detail ? (
          <p className={cn("leading-5", status.variant === "destructive" ? "text-destructive" : "text-foreground")}>{status.detail}</p>
        ) : (
          <p
            className="flex items-center gap-1.5 text-muted-foreground"
            title={channel.lastSyncedAt ? `Profile updated ${formatDistanceToNow(new Date(channel.lastSyncedAt), { addSuffix: true })}` : undefined}
            suppressHydrationWarning
          >
            <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
            Receiving comments and messages
          </p>
        )}
      </div>

      {status.needsReconnect && canManage ? (
        <div className="border-t px-5 py-3">
          <Button asChild size="sm" className="w-full">
            <a href={connectHref(channel.platform)}>
              <PlatformIcon platform={channel.platform} />
              Reconnect {PLATFORM_LABEL[channel.platform]}
            </a>
          </Button>
        </div>
      ) : null}

      <MediaDialog channel={channel} open={mediaOpen} onOpenChange={setMediaOpen} />

      {canManage ? (
        <ConfirmDialog
          trigger={null}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Disconnect ${name}?`}
          description="Automations on this account stop replying. Contacts, conversations and automations are kept, so reconnecting later picks up where you left off."
          confirmLabel="Disconnect"
          destructive
          onConfirm={disconnect}
        />
      ) : null}

      {canPurge ? (
        <PurgeChannelDialog
          channel={channel}
          open={purgeOpen}
          onOpenChange={setPurgeOpen}
          onPurged={() => {
            toast.success(`Deleted ${name}`, { description: "The account and everything tied to it are gone." });
            router.refresh();
          }}
        />
      ) : null}
    </article>
  );
}

/**
 * Typed confirmation for the irreversible purge. A generic ConfirmDialog is
 * too easy to click through for an action that removes contacts and
 * conversations; the user must type the account's handle (or Page name).
 */
function PurgeChannelDialog({
  channel,
  open,
  onOpenChange,
  onPurged,
}: {
  channel: ChannelView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurged: () => void;
}) {
  const [typed, setTyped] = React.useState("");
  const [pending, setPending] = React.useState(false);
  // Facebook Pages have no @handle, so fall back to the Page name.
  const expected = channel.username ?? channel.name ?? "DELETE";
  const matches = typed.trim() === expected;

  function handleOpenChange(next: boolean) {
    if (pending) return;
    onOpenChange(next);
    if (!next) setTyped("");
  }

  async function handlePurge() {
    if (!matches) return;
    setPending(true);
    try {
      await apiFetch(`/api/channels/${channel.id}?purge=1`, { method: "DELETE" });
      setPending(false);
      setTyped("");
      onOpenChange(false);
      onPurged();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete this account"));
      setPending(false);
    }
  }

  const inputId = `purge-confirm-${channel.id}`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handlePurge();
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Delete {channelDisplayName(channel)} and its data?</DialogTitle>
            <DialogDescription>
              This permanently removes the account with its {formatNumber(channel.counts.contacts)} contact
              {channel.counts.contacts === 1 ? "" : "s"}, conversations, {formatNumber(channel.counts.automations)} automation
              {channel.counts.automations === 1 ? "" : "s"}, broadcasts, posts and message history. Unlike Disconnect, reconnecting
              won&apos;t bring any of it back.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={inputId}>
              Type <span className="font-semibold">{expected}</span> to confirm
            </Label>
            <Input
              id={inputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoFocus
              disabled={pending}
              placeholder={expected}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" loading={pending} disabled={!matches}>
              Delete account and data
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3">
      <dt className="whitespace-nowrap text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">{formatNumber(value)}</dd>
    </div>
  );
}
