"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, Check, Images, MoreHorizontal, RefreshCw, Trash2, Unplug, X } from "lucide-react";

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
import type { ChannelSummary } from "@/lib/services/channels";
import { cn, formatNumber, initials } from "@/lib/utils";

import { apiFetch, errorMessage } from "./api";
import { channelDisplayName, channelStatusView, connectHref, PLATFORM_LABEL } from "./channel-status";
import { MediaDialog } from "./media-dialog";

export interface ChannelCardProps {
  channel: ChannelSummary;
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
  const tokenDays = channel.health.tokenDaysLeft;
  const tokenOk = !status.needsReconnect && (tokenDays === null || tokenDays > 0);

  async function refresh() {
    setRefreshing(true);
    try {
      await apiFetch(`/api/channels/${channel.id}/refresh`, { method: "POST" });
      toast.success(`Refreshed ${name}`, { description: "Profile, webhook subscription and posts are up to date." });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't refresh this channel"));
    } finally {
      setRefreshing(false);
    }
  }

  async function disconnect() {
    try {
      await apiFetch(`/api/channels/${channel.id}`, { method: "DELETE" });
      toast.success(`Disconnected ${name}`, { description: "Automations on this account are paused until you reconnect." });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't disconnect this channel"));
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
                {status.needsReconnect || status.variant === "warning" ? (
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
                    Delete channel &amp; data
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
        <Stat label="DMs · 7d" value={channel.counts.dms7d} />
      </dl>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 text-xs">
        <HealthItem ok={channel.webhookSubscribed && !disconnected} label="Webhook" />
        {/* Facebook Page tokens have no expiry, so only Instagram shows a countdown. */}
        <HealthItem ok={tokenOk} label={tokenDays !== null && tokenOk ? `Token · ${tokenDays}d` : "Token"} />
        <span className="ml-auto text-muted-foreground" suppressHydrationWarning>
          {channel.lastSyncedAt ? `Synced ${formatDistanceToNow(new Date(channel.lastSyncedAt), { addSuffix: true })}` : "Not synced yet"}
        </span>
      </div>

      {channel.lastError ? (
        <p className="flex items-start gap-1.5 border-t px-5 py-2.5 text-xs text-destructive">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-words">{channel.lastError}</span>
        </p>
      ) : null}

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
          description="The access token is destroyed and automations on this account stop firing. Contacts, conversations and automations are kept, so reconnecting later restores everything."
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
            toast.success(`Deleted ${name}`, { description: "The channel and every record tied to it are gone." });
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
  channel: ChannelSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurged: () => void;
}) {
  const [typed, setTyped] = React.useState("");
  const [pending, setPending] = React.useState(false);
  // Facebook Pages have no @handle, so fall back to the Page name; the id is the last resort.
  const expected = channel.username ?? channel.name ?? channel.externalId;
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
      toast.error(errorMessage(err, "Couldn't delete this channel"));
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
              This permanently removes the channel together with its {formatNumber(channel.counts.contacts)} contact
              {channel.counts.contacts === 1 ? "" : "s"}, conversations, {formatNumber(channel.counts.automations)} automation
              {channel.counts.automations === 1 ? "" : "s"}, broadcasts, cached posts and delivery logs. Unlike Disconnect,
              nothing can be restored by reconnecting.
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
              Delete channel &amp; data
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-5 py-3">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">{formatNumber(value)}</dd>
    </div>
  );
}

function HealthItem({ ok, label }: { ok: boolean; label: string }) {
  const Icon = ok ? Check : X;
  return (
    <span className={cn("inline-flex items-center gap-1", ok ? "text-foreground" : "text-muted-foreground")}>
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-full border",
          ok ? "border-success/30 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        <Icon className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
      <span>{label}</span>
      <span className="sr-only">{ok ? "OK" : "not OK"}</span>
    </span>
  );
}
