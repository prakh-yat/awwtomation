"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { CalendarClock, Image as ImageIcon, Layers, Link2, Plug, Plus, Save, Search, Send, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { OutboundMessage } from "@/lib/meta/types";
import { cn } from "@/lib/utils";

import { apiFetch, errorMessage } from "./api";
import { audienceFromSegment, channelLabel, formatCount, formatDateTime, statusMeta, timeZoneAbbreviation, timeZoneLabel } from "./format";
import { MessagePreview } from "./message-preview";
import { SendConfirmDialog } from "./send-confirm-dialog";
import { TagPicker } from "./tag-picker";
import { fromDatetimeLocal, toDatetimeLocal } from "./timezone";
import {
  BUTTON_TITLE_MAX_CHARS,
  MAX_BUTTONS,
  NAME_MAX_CHARS,
  charLength,
  messageLengthUsage,
  type AudienceEstimate,
  type BroadcastAudience,
  type BroadcastRow,
  type ChannelOption,
  type DraftButton,
  type DraftMessage,
  type SegmentSummary,
  type TagOption,
} from "./types";
import { WindowCallout } from "./window-callout";

export interface BroadcastEditorProps {
  mode: "create" | "edit";
  /** Required in edit mode (DRAFT or SCHEDULED). */
  broadcast?: BroadcastRow;
  channels: ChannelOption[];
  /** Workspace IANA timezone: schedule times are entered in it. */
  timeZone: string;
}

type Errors = Partial<Record<"name" | "channelId" | "text" | "imageUrl" | "buttons" | "schedule", string>>;
type Busy = null | "draft" | "schedule" | "send" | "unschedule";
type ScheduleMode = "now" | "later";

const EMPTY_AUDIENCE: BroadcastAudience = {
  tags: [],
  tagMode: "any",
  excludeTags: [],
  onlyFollowers: false,
  lastInteractionDays: null,
  q: "",
  segmentId: null,
  onlyInWindow: true,
};
const ESTIMATE_DEBOUNCE_MS = 350;
const NO_SEGMENT = "__custom__";
const ANY_TIME = "any";
const LAST_INTERACTION_OPTIONS: Array<{ days: number; label: string }> = [
  { days: 1, label: "Last 24 hours" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
];

function toDraft(message: OutboundMessage | undefined): DraftMessage {
  return {
    text: message?.text ?? "",
    buttons: (message?.buttons ?? []).flatMap((b) => (b.type === "web_url" ? [{ title: b.title, url: b.url }] : [])),
    imageUrl: message?.imageUrl ?? "",
  };
}

function toOutbound(draft: DraftMessage): OutboundMessage {
  const out: OutboundMessage = {};
  const text = draft.text.trim();
  if (text) out.text = text;
  const buttons = draft.buttons
    .filter((b) => b.title.trim() || b.url.trim())
    .map((b) => ({ type: "web_url" as const, title: b.title.trim(), url: b.url.trim() }));
  if (buttons.length) out.buttons = buttons;
  if (draft.imageUrl.trim()) out.imageUrl = draft.imageUrl.trim();
  return out;
}

/** The contacts lane returns `{ tags: [{ tag, count }] }`; tolerate a bare array or plain strings too. */
function normalizeTags(data: unknown): TagOption[] {
  const list = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as { tags?: unknown }).tags) ? (data as { tags: unknown[] }).tags : [];
  const out: TagOption[] = [];
  for (const item of list) {
    if (typeof item === "string") out.push({ tag: item, count: 0 });
    else if (item && typeof item === "object" && typeof (item as { tag?: unknown }).tag === "string") {
      const count = (item as { count?: unknown }).count;
      out.push({ tag: (item as { tag: string }).tag, count: typeof count === "number" ? count : 0 });
    }
  }
  return out;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

function BroadcastEditor({ mode, broadcast, channels, timeZone }: BroadcastEditorProps) {
  const router = useRouter();
  const isEdit = mode === "edit" && Boolean(broadcast);
  const defaultChannel = broadcast?.channelId ?? channels.find((c) => c.status === "ACTIVE")?.id ?? channels[0]?.id ?? "";

  const [status, setStatus] = React.useState<BroadcastRow["status"]>(broadcast?.status ?? "DRAFT");
  const [name, setName] = React.useState(broadcast?.name ?? "");
  const [channelId, setChannelId] = React.useState(defaultChannel);
  const [audience, setAudience] = React.useState<BroadcastAudience>(broadcast?.audience ?? EMPTY_AUDIENCE);
  const [draft, setDraft] = React.useState<DraftMessage>(() => toDraft(broadcast?.message));
  const [scheduleMode, setScheduleMode] = React.useState<ScheduleMode>(broadcast?.scheduledAt ? "later" : "now");
  const [scheduledLocal, setScheduledLocal] = React.useState(broadcast?.scheduledAt ? toDatetimeLocal(new Date(broadcast.scheduledAt), timeZone) : "");
  const [scheduledAtSaved, setScheduledAtSaved] = React.useState<string | null>(broadcast?.scheduledAt ?? null);

  const [tagOptions, setTagOptions] = React.useState<TagOption[]>([]);
  const [segmentOptions, setSegmentOptions] = React.useState<SegmentSummary[]>([]);
  const [segmentsLoaded, setSegmentsLoaded] = React.useState(false);
  const [estimate, setEstimate] = React.useState<AudienceEstimate | null>(null);
  const [estimating, setEstimating] = React.useState(false);
  const [estimateError, setEstimateError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Errors>({});
  const [busy, setBusy] = React.useState<Busy>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const channel = channels.find((c) => c.id === channelId) ?? null;
  const outbound = React.useMemo(() => toOutbound(draft), [draft]);
  const hasButtons = draft.buttons.some((b) => b.title.trim() || b.url.trim());
  const textUsage = messageLengthUsage(draft.text, hasButtons);

  // Tags and segments come from the contacts lane; an empty/failed response just means free-text entry.
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/contacts/tags")
      .then(async (res) => (res.ok ? normalizeTags(await res.json()) : []))
      .then((list) => {
        if (!cancelled) setTagOptions(list);
      })
      .catch(() => undefined);
    apiFetch<{ segments: SegmentSummary[] }>("/api/segments")
      .then((res) => {
        if (cancelled) return;
        setSegmentOptions(res.segments);
        setSegmentsLoaded(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const activeSegment = audience.segmentId ? (segmentOptions.find((s) => s.id === audience.segmentId) ?? null) : null;

  /** Any manual edit detaches the audience from its segment: the label must never claim filters it no longer has. */
  function updateAudience(patch: Partial<BroadcastAudience>) {
    setAudience((a) => ({ ...a, ...patch, segmentId: null }));
  }

  /** Copy a saved segment's filters in. Its channel (if it has one) becomes the broadcast channel when it's available here. */
  function applySegment(id: string) {
    if (id === NO_SEGMENT) {
      setAudience((a) => ({ ...a, segmentId: null }));
      return;
    }
    const segment = segmentOptions.find((s) => s.id === id);
    if (!segment) return;
    setAudience(audienceFromSegment(segment));
    const segmentChannel = segment.filters.channelId;
    if (segmentChannel && channels.some((c) => c.id === segmentChannel)) setChannelId(segmentChannel);
  }

  // Live estimate: debounced, cancellable, re-run whenever the channel or audience changes.
  React.useEffect(() => {
    if (!channelId) {
      setEstimate(null);
      return;
    }
    const controller = new AbortController();
    setEstimating(true);
    setEstimateError(null);
    const timer = setTimeout(() => {
      apiFetch<AudienceEstimate>("/api/broadcasts/estimate", { method: "POST", json: { channelId, audience }, signal: controller.signal })
        .then((data) => {
          if (!controller.signal.aborted) setEstimate(data);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setEstimate(null);
          setEstimateError(errorMessage(err, "Couldn't estimate the audience"));
        })
        .finally(() => {
          if (!controller.signal.aborted) setEstimating(false);
        });
    }, ESTIMATE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [channelId, audience]);

  function updateButton(index: number, patch: Partial<DraftButton>) {
    setDraft((d) => ({ ...d, buttons: d.buttons.map((b, i) => (i === index ? { ...b, ...patch } : b)) }));
  }

  function validate(opts: { schedule: boolean }): Errors {
    const next: Errors = {};
    if (!name.trim()) next.name = "Give the broadcast a name";
    if (!channelId) next.channelId = "Choose an account";
    else if (channel && channel.status !== "ACTIVE") next.channelId = "Reconnect this account before sending";
    const text = draft.text.trim();
    if (!text && !draft.imageUrl.trim()) next.text = "Add some text or an image";
    if (textUsage.value > textUsage.max) next.text = hasButtons ? "The message is too long to send with buttons. Shorten it a little." : "The message is too long for Instagram. Shorten it a little.";
    if (draft.imageUrl.trim() && !isHttpUrl(draft.imageUrl.trim())) next.imageUrl = "Use a full image link, starting with https://";
    for (const b of draft.buttons) {
      if (!b.title.trim() && !b.url.trim()) continue;
      if (!b.title.trim()) next.buttons = "Every button needs a label";
      else if (charLength(b.title.trim()) > BUTTON_TITLE_MAX_CHARS) next.buttons = `Button labels are at most ${BUTTON_TITLE_MAX_CHARS} characters`;
      else if (!isHttpUrl(b.url.trim())) next.buttons = "Every button needs a full link, starting with https://";
    }
    if (opts.schedule) {
      const when = fromDatetimeLocal(scheduledLocal, timeZone);
      if (!when) next.schedule = "Pick a date and time";
      else if (when.getTime() < Date.now() + 60_000) next.schedule = "Pick a time at least a minute from now";
    }
    setErrors(next);
    const first = Object.values(next)[0];
    if (first) toast.error(first);
    return next;
  }

  /** Create or update; returns the persisted id. */
  async function persist(scheduledAt: string | null): Promise<string> {
    const body = { name: name.trim(), channelId, message: outbound, audience, scheduledAt };
    if (isEdit && broadcast) {
      const res = await apiFetch<{ broadcast: { id: string; status: BroadcastRow["status"]; scheduledAt: string | null } }>(`/api/broadcasts/${broadcast.id}`, { method: "PATCH", json: body });
      setStatus(res.broadcast.status);
      setScheduledAtSaved(res.broadcast.scheduledAt);
      return res.broadcast.id;
    }
    const res = await apiFetch<{ broadcast: { id: string } }>("/api/broadcasts", { method: "POST", json: body });
    return res.broadcast.id;
  }

  async function saveDraft() {
    if (Object.keys(validate({ schedule: false })).length) return;
    setBusy("draft");
    try {
      const id = await persist(null);
      toast.success("Draft saved");
      if (isEdit) {
        setScheduleMode("now");
        router.refresh();
      } else {
        router.push(`/broadcasts/${id}`);
      }
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the broadcast"));
    } finally {
      setBusy(null);
    }
  }

  async function schedule() {
    if (Object.keys(validate({ schedule: true })).length) return;
    const when = fromDatetimeLocal(scheduledLocal, timeZone);
    if (!when) return;
    setBusy("schedule");
    try {
      const id = await persist(when.toISOString());
      toast.success(`Scheduled for ${formatDateTime(when, timeZone)}`);
      if (isEdit) router.refresh();
      else router.push(`/broadcasts/${id}`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't schedule the broadcast"));
    } finally {
      setBusy(null);
    }
  }

  async function unschedule() {
    if (!broadcast) return;
    setBusy("unschedule");
    try {
      await apiFetch(`/api/broadcasts/${broadcast.id}`, { method: "PATCH", json: { scheduledAt: null } });
      setStatus("DRAFT");
      setScheduledAtSaved(null);
      setScheduleMode("now");
      toast.success("Schedule removed. It's a draft again.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't remove the schedule"));
    } finally {
      setBusy(null);
    }
  }

  function requestSend() {
    if (Object.keys(validate({ schedule: false })).length) return;
    setConfirmOpen(true);
  }

  async function confirmSend(_est: AudienceEstimate) {
    setBusy("send");
    let id: string | null = null;
    try {
      id = await persist(null);
      const result = await apiFetch<{ eligible: number; skippedWindow: number }>(`/api/broadcasts/${id}/send`, { method: "POST" });
      toast.success(`Sending to ${formatCount(result.eligible)} contact${result.eligible === 1 ? "" : "s"}`, {
        description: result.skippedWindow > 0 ? `${formatCount(result.skippedWindow)} not sent because they haven't messaged you in the last 24 hours` : undefined,
      });
      router.push(`/broadcasts/${id}`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't send the broadcast"));
      // The draft was saved even if the send failed: don't strand a new one on /new.
      if (id && !isEdit) router.push(`/broadcasts/${id}`);
      throw err;
    } finally {
      setBusy(null);
    }
  }

  if (channels.length === 0) {
    return (
      <>
        <PageHeader backHref="/broadcasts" backLabel="Broadcasts" title="New broadcast" />
        <EmptyState
          icon={Plug}
          title="Connect an account first"
          description="Broadcasts go out from a connected Instagram or Facebook account. Connect one first."
          action={
            <Button asChild>
              <Link href="/channels">Go to Channels</Link>
            </Button>
          }
        />
      </>
    );
  }

  const scheduledDate = fromDatetimeLocal(scheduledLocal, timeZone);
  const minLocal = toDatetimeLocal(new Date(Date.now() + 5 * 60_000), timeZone);
  const primaryDisabled = busy !== null;
  const meta = statusMeta(status);

  return (
    <>
      <PageHeader
        backHref="/broadcasts"
        backLabel="Broadcasts"
        title={isEdit ? name.trim() || "Edit broadcast" : "New broadcast"}
        actions={
          <>
            {isEdit ? <Badge variant={meta.variant}>{meta.label}</Badge> : null}
            <Button type="button" variant="outline" onClick={saveDraft} loading={busy === "draft"} disabled={primaryDisabled && busy !== "draft"}>
              <Save />
              {isEdit ? "Save" : "Save draft"}
            </Button>
            {scheduleMode === "later" ? (
              <Button type="button" onClick={schedule} loading={busy === "schedule"} disabled={primaryDisabled && busy !== "schedule"}>
                <CalendarClock />
                Schedule
              </Button>
            ) : (
              <Button type="button" onClick={requestSend} loading={busy === "send"} disabled={primaryDisabled && busy !== "send"}>
                <Send />
                Send now
              </Button>
            )}
          </>
        }
      />

      <WindowCallout className="mb-6" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>A name only your team sees, and the account it&apos;s sent from.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bc-name">Name</Label>
                <Input
                  id="bc-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Winter collection preview"
                  maxLength={NAME_MAX_CHARS}
                  aria-invalid={errors.name ? true : undefined}
                  autoComplete="off"
                />
                {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="bc-channel">Account</Label>
                <Select value={channelId} onValueChange={setChannelId}>
                  <SelectTrigger id="bc-channel" aria-invalid={errors.channelId ? true : undefined}>
                    <SelectValue placeholder="Choose an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <PlatformIcon platform={c.platform} size={14} />
                          <span>{channelLabel(c)}</span>
                          {c.status !== "ACTIVE" ? <span className="text-muted-foreground">· {c.status.toLowerCase().replace("_", " ")}</span> : null}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.channelId ? (
                  <p className="text-xs text-destructive">{errors.channelId}</p>
                ) : channel && channel.status !== "ACTIVE" ? (
                  <p className="text-xs text-warning">
                    This channel needs reconnecting.{" "}
                    <Link href="/channels" className="underline underline-offset-2">
                      Fix in Channels
                    </Link>
                  </p>
                ) : null}
              </div>
              {isEdit && status === "SCHEDULED" && scheduledAtSaved ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-[13px] sm:col-span-2">
                  <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>
                    Scheduled for <span className="font-medium">{formatDateTime(scheduledAtSaved, timeZone)}</span> ({timeZoneAbbreviation(timeZone)})
                  </span>
                  <Button type="button" variant="ghost" size="sm" className="ml-auto h-7" onClick={unschedule} loading={busy === "unschedule"}>
                    Unschedule
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4" strokeWidth={1.75} />
                Audience
              </CardTitle>
              <CardDescription>Use a saved segment or filter by tags. Leave it empty to include everyone who has messaged this account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="bc-segment">Use a saved segment</Label>
                <Select value={audience.segmentId ?? NO_SEGMENT} onValueChange={applySegment}>
                  <SelectTrigger id="bc-segment">
                    <SelectValue placeholder="No segment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SEGMENT}>No segment, use the filters below</SelectItem>
                    {segmentOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex items-center gap-2">
                          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate">{s.name}</span>
                          <span className="tabular-nums text-muted-foreground">{formatCount(s.count)}</span>
                        </span>
                      </SelectItem>
                    ))}
                    {segmentOptions.length === 0 ? (
                      <div className="px-2 py-2 text-[12px] text-muted-foreground">No saved segments yet. Save one from the Contacts page.</div>
                    ) : null}
                  </SelectContent>
                </Select>
                {activeSegment ? (
                  <p className="text-xs text-muted-foreground">
                    Filters copied from <span className="font-medium text-foreground">{activeSegment.name}</span>
                    {activeSegment.filters.excludeFollowers ? " (its “not following” rule has no broadcast equivalent and was dropped)" : ""}. Editing anything below turns this into a custom
                    audience; later changes to the segment won&apos;t affect this broadcast.
                  </p>
                ) : audience.segmentId && segmentsLoaded ? (
                  <p className="text-xs text-muted-foreground">The segment this audience came from was deleted. The filters below still apply.</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="bc-tags">Include contacts with {audience.tagMode === "all" ? "all" : "any"} of these tags</Label>
                  <div className="inline-flex h-7 items-center rounded-md bg-muted p-0.5 text-[12px]" role="radiogroup" aria-label="Tag match mode">
                    {(["any", "all"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={audience.tagMode === m}
                        onClick={() => updateAudience({ tagMode: m })}
                        className={cn(
                          "h-6 rounded-[5px] px-2 font-medium transition-colors",
                          audience.tagMode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {m === "any" ? "Match any" : "Match all"}
                      </button>
                    ))}
                  </div>
                </div>
                <TagPicker id="bc-tags" value={audience.tags} onChange={(tags) => updateAudience({ tags })} options={tagOptions} emptyLabel="Everyone on this account" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bc-exclude">Exclude contacts with any of these tags</Label>
                <TagPicker id="bc-exclude" value={audience.excludeTags} onChange={(excludeTags) => updateAudience({ excludeTags })} options={tagOptions} emptyLabel="No exclusions" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bc-last-interaction">Last activity</Label>
                  <Select
                    value={audience.lastInteractionDays ? String(audience.lastInteractionDays) : ANY_TIME}
                    onValueChange={(v) => updateAudience({ lastInteractionDays: v === ANY_TIME ? null : Number(v) })}
                  >
                    <SelectTrigger id="bc-last-interaction">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY_TIME}>Any time</SelectItem>
                      {LAST_INTERACTION_OPTIONS.map((o) => (
                        <SelectItem key={o.days} value={String(o.days)}>
                          {o.label}
                        </SelectItem>
                      ))}
                      {audience.lastInteractionDays && !LAST_INTERACTION_OPTIONS.some((o) => o.days === audience.lastInteractionDays) ? (
                        <SelectItem value={String(audience.lastInteractionDays)}>Last {audience.lastInteractionDays} days</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bc-q">Name or @username contains</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input id="bc-q" value={audience.q} onChange={(e) => updateAudience({ q: e.target.value })} placeholder="Optional" className="pl-8" maxLength={120} autoComplete="off" />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
                <div>
                  <Label htmlFor="bc-followers" className="cursor-pointer">
                    Only followers
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">Uses the follow status from the last time we checked each person.</p>
                </div>
                <Switch id="bc-followers" checked={audience.onlyFollowers} onCheckedChange={(onlyFollowers) => updateAudience({ onlyFollowers })} />
              </div>

              <div className="rounded-lg border bg-muted/40 p-4" aria-live="polite">
                {!channelId ? (
                  <p className="text-sm text-muted-foreground">Choose an account to see who it reaches.</p>
                ) : estimateError ? (
                  <p className="text-sm text-destructive">{estimateError}</p>
                ) : estimate ? (
                  <div className={cn("space-y-1 transition-opacity", estimating && "opacity-60")}>
                    <p className="text-xl font-semibold tabular-nums tracking-tight">
                      {formatCount(estimate.eligible)} <span className="text-sm font-normal text-muted-foreground">can receive it now</span>
                      <span className="mx-2 text-sm font-normal text-muted-foreground">·</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        {formatCount(estimate.skippedWindow)} haven&apos;t messaged in 24 hours
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatCount(estimate.total)} contact{estimate.total === 1 ? "" : "s"} match this audience. Who can receive it is checked again when it sends.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner size="sm" /> Estimating…
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Message</CardTitle>
              <CardDescription>
                Add <code className="rounded bg-muted px-1 font-mono text-[12px]">{"{{first_name}}"}</code> and each person sees their own name.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="bc-text">Text</Label>
                  <span className={cn("text-[11px] tabular-nums text-muted-foreground", textUsage.value > textUsage.max && "text-destructive")}>
                    {formatCount(textUsage.value)} / {formatCount(textUsage.max)}
                  </span>
                </div>
                <Textarea
                  id="bc-text"
                  value={draft.text}
                  onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                  placeholder="Hi {{first_name}}, the winter collection is live. Tap below to see it."
                  rows={5}
                  aria-invalid={errors.text ? true : undefined}
                />
                {errors.text ? <p className="text-xs text-destructive">{errors.text}</p> : null}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Buttons</Label>
                  <span className="text-[11px] text-muted-foreground">
                    {draft.buttons.length} / {MAX_BUTTONS}
                  </span>
                </div>
                {draft.buttons.length === 0 ? <p className="text-[13px] text-muted-foreground">No buttons. Add up to {MAX_BUTTONS} link buttons under the text.</p> : null}
                <div className="space-y-2">
                  {draft.buttons.map((b, i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]">
                      <Input
                        value={b.title}
                        onChange={(e) => updateButton(i, { title: e.target.value })}
                        placeholder="Button label"
                        maxLength={BUTTON_TITLE_MAX_CHARS}
                        aria-label={`Button ${i + 1} label`}
                      />
                      <div className="relative">
                        <Link2 className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input value={b.url} onChange={(e) => updateButton(i, { url: e.target.value })} placeholder="https://…" className="pl-8" inputMode="url" aria-label={`Button ${i + 1} link`} />
                      </div>
                      <Button type="button" variant="ghost" size="icon" aria-label="Remove button" onClick={() => setDraft((d) => ({ ...d, buttons: d.buttons.filter((_, j) => j !== i) }))}>
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
                {errors.buttons ? <p className="text-xs text-destructive">{errors.buttons}</p> : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={draft.buttons.length >= MAX_BUTTONS}
                  onClick={() => setDraft((d) => ({ ...d, buttons: [...d.buttons, { title: "", url: "" }] }))}
                >
                  <Plus />
                  Add button
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bc-image">Image link (optional)</Label>
                <div className="relative">
                  <ImageIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="bc-image"
                    value={draft.imageUrl}
                    onChange={(e) => setDraft((d) => ({ ...d, imageUrl: e.target.value }))}
                    placeholder="https://yourshop.com/images/winter.jpg"
                    className="pl-8"
                    inputMode="url"
                    aria-invalid={errors.imageUrl ? true : undefined}
                  />
                </div>
                {errors.imageUrl ? <p className="text-xs text-destructive">{errors.imageUrl}</p> : <p className="text-xs text-muted-foreground">Sent just before the text. Use a public link that starts with https://</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
              <CardDescription>Who can receive it is worked out when it sends, not when you schedule it.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={scheduleMode} onValueChange={(v) => setScheduleMode(v === "later" ? "later" : "now")}>
                <TabsList>
                  <TabsTrigger value="now">
                    <Send />
                    Send now
                  </TabsTrigger>
                  <TabsTrigger value="later">
                    <CalendarClock />
                    Schedule for later
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {scheduleMode === "later" ? (
                <div className="grid gap-2 sm:max-w-sm">
                  <Label htmlFor="bc-when">Send at</Label>
                  <Input
                    id="bc-when"
                    type="datetime-local"
                    value={scheduledLocal}
                    min={minLocal}
                    onChange={(e) => setScheduledLocal(e.target.value)}
                    aria-invalid={errors.schedule ? true : undefined}
                  />
                  {errors.schedule ? (
                    <p className="text-xs text-destructive">{errors.schedule}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Times are in {timeZoneLabel(timeZone)}, your workspace time zone.
                      {scheduledDate && scheduledDate.getTime() > Date.now() ? ` That's ${formatDistanceToNow(scheduledDate, { addSuffix: true })}.` : ""}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">Goes out when you confirm. You&apos;ll see how many people it reaches first.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <MessagePreview message={outbound} platform={channel?.platform} senderName={channel ? channelLabel(channel) : undefined} />
          <p className="mt-3 text-center text-[11px] text-muted-foreground">Preview · placeholders filled with sample values</p>
        </div>
      </div>

      <SendConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        name={name.trim()}
        channelId={channelId}
        audience={audience}
        estimate={estimating ? null : estimate}
        onConfirm={confirmSend}
      />
    </>
  );
}

export { BroadcastEditor };
