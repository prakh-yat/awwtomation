"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Images, MoreHorizontal, RefreshCw, Trash2, Unplug } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlatformMark } from "@/components/ui/platform-badge";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { toast } from "@/components/ui/sonner";
import type { ChannelView } from "@/lib/services/channels";
import { cn, formatNumber, initials } from "@/lib/utils";

import { apiFetch, errorMessage } from "./api";
import { channelDisplayName, channelStatusView, connectHref, PLATFORM_LABEL, type StatusVariant } from "./channel-status";
import { MediaDialog } from "./media-dialog";

/** The status line, in the badge's colour at its soft strength. */
const DETAIL_TONE: Record<StatusVariant, string> = {
  success: "text-green-ink",
  warning: "text-orange-ink",
  destructive: "text-destructive",
  secondary: "text-muted-foreground",
};

export interface AccountRowProps {
  channel: ChannelView;
  /** ADMIN+; gates disconnect and reconnect. Refresh and viewing posts are open to every member. */
  canManage: boolean;
  /** OWNER only; gates the irreversible "Delete account and data" action. */
  canPurge?: boolean;
  /** False when another account already holds this platform in the workspace. */
  canReconnect?: boolean;
  /** Draws the row's attention when the dialog was opened for it. */
  highlighted?: boolean;
  index?: number;
}

/** One connected account in the accounts dialog: who it is, how it is doing, and what can be done with it. */
export function AccountRow({ channel, canManage, canPurge = false, canReconnect = true, highlighted = false, index = 0 }: AccountRowProps) {
  const router = useRouter();
  const ref = React.useRef<HTMLLIElement>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [mediaOpen, setMediaOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [purgeOpen, setPurgeOpen] = React.useState(false);

  const status = channelStatusView(channel);
  const name = channelDisplayName(channel);
  const disconnected = channel.status === "DISCONNECTED";
  const expiring = channel.health.state === "expiring";
  const showReconnect = canManage && canReconnect && (status.needsReconnect || expiring);

  React.useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  async function refresh() {
    setRefreshing(true);
    try {
      await apiFetch(`/api/channels/${channel.id}/refresh`, { method: "POST" });
      toast.success(`${name} is up to date`);
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
      toast.success(`Disconnected ${name}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't disconnect this account"));
      throw err; // keeps the confirm dialog open
    }
  }

  const facts = [
    PLATFORM_LABEL[channel.platform],
    channel.followerCount !== null ? `${formatNumber(channel.followerCount)} followers` : null,
    `${formatNumber(channel.counts.automations)} automation${channel.counts.automations === 1 ? "" : "s"}`,
    `${formatNumber(channel.counts.dms7d)} DMs this week`,
  ].filter(Boolean);

  return (
    <li
      ref={ref}
      className={cn(
        "rise flex items-start gap-3.5 rounded-2xl border bg-card p-4 transition-shadow",
        status.variant === "destructive" && "border-destructive/35",
        highlighted && "border-ink",
      )}
      style={{ "--i": Math.min(index, 12) } as React.CSSProperties}
    >
      <div className={cn("relative shrink-0", disconnected && "opacity-60 grayscale")}>
        <Avatar className="h-11 w-11 border">
          {channel.avatarUrl ? <AvatarImage src={channel.avatarUrl} alt="" referrerPolicy="no-referrer" /> : null}
          <AvatarFallback className="text-[13px]">{initials(channel.name ?? channel.username, channel.platform[0])}</AvatarFallback>
        </Avatar>
        <PlatformMark aria-hidden platform={channel.platform} size={18} className="absolute -bottom-1 -right-1 ring-2 ring-card" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="truncate text-[15px] font-semibold leading-tight">{name}</h3>
          <Badge
            variant={status.variant}
            dot={status.variant === "success" ? "pulse" : true}
            title={
              status.variant === "success" && channel.lastSyncedAt
                ? `Profile updated ${formatDistanceToNow(new Date(channel.lastSyncedAt), { addSuffix: true })}`
                : undefined
            }
            suppressHydrationWarning
          >
            {status.label}
          </Badge>
        </div>
        <p className="mt-1 truncate text-[12px] tabular-nums text-muted-foreground">{facts.join(" · ")}</p>
        {status.detail ? <p className={cn("mt-1.5 text-[12px] font-medium leading-snug", DETAIL_TONE[status.variant])}>{status.detail}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {showReconnect ? (
          <Button asChild size="sm" variant={status.needsReconnect ? "default" : "outline"}>
            <a href={connectHref(channel.platform)}>
              <PlatformIcon platform={channel.platform} />
              Reconnect
            </a>
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More for ${name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => setMediaOpen(true)} disabled={disconnected}>
              <Images />
              View posts
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void refresh()} disabled={refreshing || disconnected}>
              <RefreshCw className={cn(refreshing && "animate-spin")} />
              Refresh
            </DropdownMenuItem>
            {(canManage && !disconnected) || canPurge ? <DropdownMenuSeparator /> : null}
            {canManage && !disconnected ? (
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <MediaDialog channel={channel} open={mediaOpen} onOpenChange={setMediaOpen} />

      {canManage ? (
        <ConfirmDialog
          trigger={null}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Disconnect ${name}?`}
          description="Its automations stop replying. Contacts, conversations and automations stay, so you can reconnect later."
          confirmLabel="Disconnect"
          destructive
          onConfirm={disconnect}
        />
      ) : null}

      {canPurge ? (
        <PurgeAccountDialog
          channel={channel}
          open={purgeOpen}
          onOpenChange={setPurgeOpen}
          onPurged={() => {
            toast.success(`Deleted ${name}`);
            router.refresh();
          }}
        />
      ) : null}
    </li>
  );
}

/**
 * Typed confirmation for the irreversible purge. A generic ConfirmDialog is
 * too easy to click through for an action that removes contacts and
 * conversations; the user must type the account's handle (or Page name).
 */
function PurgeAccountDialog({
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
  const contacts = channel.counts.contacts;
  const automations = channel.counts.automations;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handlePurge();
          }}
          className="space-y-5"
        >
          <DialogHeader>
            <DialogTitle>Delete {channelDisplayName(channel)} and its data?</DialogTitle>
            <DialogDescription>
              This deletes {formatNumber(contacts)} contact{contacts === 1 ? "" : "s"}, {formatNumber(automations)} automation
              {automations === 1 ? "" : "s"}, and every conversation, broadcast and post from this account. Reconnecting won&apos;t bring
              them back.
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
          <DialogFooter>
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
