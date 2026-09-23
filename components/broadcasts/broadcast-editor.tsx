"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, ArrowRight, CalendarClock, ChevronDown, Filter, Image as ImageIcon, Layers, Link2, Plug, Plus, Save, Search, Send, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformMark } from "@/components/ui/platform-badge";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stepper } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { OutboundMessage } from "@/lib/meta/types";
import { cn } from "@/lib/utils";

import { apiFetch, errorMessage } from "./api";
import { audienceFromSegment, audienceLabel, channelLabel, formatCount, formatDateTime, statusMeta, timeZoneAbbreviation, timeZoneLabel } from "./format";
import { MessagePreview } from "./message-preview";
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
type AudienceMode = "everyone" | "segment" | "filter";

const STEPS = [
  { id: "audience", label: "Audience" },
  { id: "message", label: "Message" },
  { id: "when", label: "When" },
  { id: "review", label: "Review" },
] as const;

/** Which step owns each field, so a failed save can take you straight to it. */
const FIELD_STEP: Record<keyof Errors, number> = { channelId: 0, text: 1, imageUrl: 1, buttons: 1, schedule: 2, name: 3 };

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
const ANY_TIME = "any";
const LAST_INTERACTION_OPTIONS: Array<{ days: number; label: string }> = [
  { days: 1, label: "Last 24 hours" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
];
const TEMPLATE_VARS: Array<{ token: string; label: string }> = [
  { token: "{{first_name}}", label: "First name" },
  { token: "{{name}}", label: "Full name" },
  { token: "{{username}}", label: "@username" },
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

function audienceModeOf(audience: BroadcastAudience): AudienceMode {
  if (audience.segmentId) return "segment";
  const filtered = audience.tags.length > 0 || audience.excludeTags.length > 0 || audience.onlyFollowers || Boolean(audience.lastInteractionDays) || Boolean(audience.q);
  return filtered ? "filter" : "everyone";
}

/** "Sep 23 broadcast": a name good enough that nobody has to stop and think of one. */
function defaultName(timeZone: string): string {
  try {
    return `${new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(new Date())} broadcast`;
  } catch {
    return "New broadcast";
  }
}

/** Wall-clock presets in the workspace's zone: an hour from now, and tomorrow morning and evening. */
function quickTimes(timeZone: string): Array<{ label: string; value: string }> {
  const now = new Date();
  const inAnHour = toDatetimeLocal(new Date(now.getTime() + 60 * 60_000), timeZone);
  const today = toDatetimeLocal(now, timeZone).slice(0, 10);
  const [y, m, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return [
    { label: "In an hour", value: inAnHour },
    { label: "Tomorrow 9:00", value: `${tomorrow}T09:00` },
    { label: "Tomorrow 18:00", value: `${tomorrow}T18:00` },
  ];
}

function StepTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="font-display text-[28px] leading-none">{title}</h2>
      {children ? <p className="mt-2 text-[14px] text-muted-foreground">{children}</p> : null}
    </div>
  );
}

function FieldError({ children }: { children?: string }) {
  return children ? <p className="text-[12px] font-medium text-destructive">{children}</p> : null;
}

function OptionCard({
  selected,
  onClick,
  icon: Icon,
  title,
  detail,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  icon: typeof Users;
  title: string;
  detail?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left outline-none transition-[border-color,background-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]",
        selected ? "border-ink bg-orange-soft" : "border-border bg-card hover:border-ink/30",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors", selected ? "bg-orange text-ink" : "bg-fog text-ink")}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{title}</span>
        {detail ? <span className="mt-0.5 block text-[12px] text-muted-foreground">{detail}</span> : null}
      </span>
    </button>
  );
}

/** How many people it reaches, which is the one number that matters while choosing the audience. */
function ReachCard({ channelId, estimate, estimating, error }: { channelId: string; estimate: AudienceEstimate | null; estimating: boolean; error: string | null }) {
  const share = estimate && estimate.total > 0 ? estimate.eligible / estimate.total : 0;
  return (
    <div className="overflow-hidden rounded-3xl bg-orange text-ink" aria-live="polite">
      <div className="bg-grid px-5 pb-5 pt-4 [--grid-line:rgb(15_15_15/0.07)]">
        <p className="brand-label">Can get it now</p>
        {!channelId ? (
          <p className="mt-3 text-[14px] font-semibold">Pick an account</p>
        ) : error ? (
          <p className="mt-3 text-[13px] font-semibold">{error}</p>
        ) : estimate ? (
          <div className={cn("transition-opacity", estimating && "opacity-60")}>
            <p className="font-display mt-1 text-[56px] leading-none tabular-nums">{formatCount(estimate.eligible)}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink/15">
              <div className="h-full rounded-full bg-ink transition-[width] duration-500 ease-soft" style={{ width: `${Math.max(share * 100, estimate.eligible > 0 ? 3 : 0)}%` }} />
            </div>
            <p className="mt-3 text-[13px] leading-snug">
              {formatCount(estimate.total)} match. {formatCount(estimate.skippedWindow)} have not messaged you in the last 24 hours, so they are skipped.
            </p>
          </div>
        ) : (
          <div className="mt-3 h-14 w-24 animate-pulse rounded-xl bg-ink/10" />
        )}
      </div>
    </div>
  );
}

function BroadcastEditor({ mode, broadcast, channels, timeZone }: BroadcastEditorProps) {
  const router = useRouter();
  const isEdit = mode === "edit" && Boolean(broadcast);
  const defaultChannel = broadcast?.channelId ?? channels.find((c) => c.status === "ACTIVE")?.id ?? channels[0]?.id ?? "";

  const [status, setStatus] = React.useState<BroadcastRow["status"]>(broadcast?.status ?? "DRAFT");
  const [name, setName] = React.useState(broadcast?.name ?? defaultName(timeZone));
  const [channelId, setChannelId] = React.useState(defaultChannel);
  const [audience, setAudience] = React.useState<BroadcastAudience>(broadcast?.audience ?? EMPTY_AUDIENCE);
  const [audienceMode, setAudienceMode] = React.useState<AudienceMode>(() => audienceModeOf(broadcast?.audience ?? EMPTY_AUDIENCE));
  const [moreFilters, setMoreFilters] = React.useState(false);
  const [draft, setDraft] = React.useState<DraftMessage>(() => toDraft(broadcast?.message));
  const [scheduleMode, setScheduleMode] = React.useState<ScheduleMode>(broadcast?.scheduledAt ? "later" : "now");
  const [scheduledLocal, setScheduledLocal] = React.useState(broadcast?.scheduledAt ? toDatetimeLocal(new Date(broadcast.scheduledAt), timeZone) : "");
  const [scheduledAtSaved, setScheduledAtSaved] = React.useState<string | null>(broadcast?.scheduledAt ?? null);

  // An existing draft opens on its summary; a new one starts at the beginning.
  const [step, setStep] = React.useState(isEdit ? STEPS.length - 1 : 0);
  const [reachable, setReachable] = React.useState(isEdit ? STEPS.length - 1 : 0);
  const [direction, setDirection] = React.useState<"forward" | "back">("forward");

  const [tagOptions, setTagOptions] = React.useState<TagOption[]>([]);
  const [segmentOptions, setSegmentOptions] = React.useState<SegmentSummary[]>([]);
  const [segmentsLoaded, setSegmentsLoaded] = React.useState(false);
  const [estimate, setEstimate] = React.useState<AudienceEstimate | null>(null);
  const [estimating, setEstimating] = React.useState(false);
  const [estimateError, setEstimateError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Errors>({});
  const [busy, setBusy] = React.useState<Busy>(null);
  const textRef = React.useRef<HTMLTextAreaElement>(null);
  const topRef = React.useRef<HTMLDivElement>(null);

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
      .catch(() => setSegmentsLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const activeSegment = audience.segmentId ? (segmentOptions.find((s) => s.id === audience.segmentId) ?? null) : null;

  /** Any manual edit detaches the audience from its segment: the label must never claim filters it no longer has. */
  function updateAudience(patch: Partial<BroadcastAudience>) {
    setAudience((a) => ({ ...a, ...patch, segmentId: null }));
  }

  function chooseAudienceMode(next: AudienceMode) {
    setAudienceMode(next);
    if (next === "everyone") setAudience(EMPTY_AUDIENCE);
    if (next === "filter" && audience.segmentId) setAudience((a) => ({ ...a, segmentId: null }));
  }

  /** Copy a saved segment's filters in. Its channel (if it has one) becomes the broadcast channel when it's available here. */
  function applySegment(id: string) {
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
          setEstimateError(errorMessage(err, "Couldn't count the audience"));
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

  function insertVar(token: string) {
    const el = textRef.current;
    const value = draft.text;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    setDraft((d) => ({ ...d, text: `${value.slice(0, start)}${token}${value.slice(end)}` }));
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + token.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  /** Every problem with the broadcast as it stands, keyed by field. */
  function collectErrors(opts: { schedule: boolean }): Errors {
    const next: Errors = {};
    if (!channelId) next.channelId = "Choose an account";
    else if (channel && channel.status !== "ACTIVE") next.channelId = "Reconnect this account first";
    const text = draft.text.trim();
    if (!text && !draft.imageUrl.trim()) next.text = "Add some text or an image";
    if (textUsage.value > textUsage.max) next.text = hasButtons ? "Too long to send with buttons. Shorten it a little." : "Too long to send. Shorten it a little.";
    if (draft.imageUrl.trim() && !isHttpUrl(draft.imageUrl.trim())) next.imageUrl = "Use a full link that starts with https://";
    for (const b of draft.buttons) {
      if (!b.title.trim() && !b.url.trim()) continue;
      if (!b.title.trim()) next.buttons = "Every button needs a label";
      else if (charLength(b.title.trim()) > BUTTON_TITLE_MAX_CHARS) next.buttons = `Button labels are at most ${BUTTON_TITLE_MAX_CHARS} characters`;
      else if (!isHttpUrl(b.url.trim())) next.buttons = "Every button needs a full link that starts with https://";
    }
    if (opts.schedule) {
      const when = fromDatetimeLocal(scheduledLocal, timeZone);
      if (!when) next.schedule = "Pick a date and time";
      else if (when.getTime() < Date.now() + 60_000) next.schedule = "Pick a time at least a minute from now";
    }
    if (!name.trim()) next.name = "Give it a name";
    return next;
  }

  /** Shows the errors and takes you to the first step that has one. Returns true when all is well. */
  function check(opts: { schedule: boolean; upTo?: number }): boolean {
    const all = collectErrors(opts);
    const relevant = Object.fromEntries(
      Object.entries(all).filter(([field]) => opts.upTo === undefined || FIELD_STEP[field as keyof Errors] <= opts.upTo),
    ) as Errors;
    setErrors(relevant);
    const fields = Object.keys(relevant) as Array<keyof Errors>;
    if (fields.length === 0) return true;
    const firstStep = Math.min(...fields.map((f) => FIELD_STEP[f]));
    if (firstStep !== step) goTo(firstStep);
    toast.error(relevant[fields.find((f) => FIELD_STEP[f] === firstStep) ?? fields[0]]);
    return false;
  }

  function goTo(index: number) {
    setDirection(index >= step ? "forward" : "back");
    setStep(index);
    setReachable((r) => Math.max(r, index));
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function next() {
    if (check({ schedule: step >= 2 && scheduleMode === "later", upTo: step })) goTo(Math.min(step + 1, STEPS.length - 1));
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
    if (!check({ schedule: false })) return;
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
    if (!check({ schedule: true })) return;
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
      toast.success("Unscheduled. It is a draft again.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't remove the schedule"));
    } finally {
      setBusy(null);
    }
  }

  async function sendNow() {
    if (!check({ schedule: false })) return;
    setBusy("send");
    let id: string | null = null;
    try {
      id = await persist(null);
      const result = await apiFetch<{ eligible: number; skippedWindow: number }>(`/api/broadcasts/${id}/send`, { method: "POST" });
      toast.success(`Sending to ${formatCount(result.eligible)} ${result.eligible === 1 ? "person" : "people"}`);
      router.push(`/broadcasts/${id}`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't send the broadcast"));
      // The draft was saved even if the send failed: don't strand a new one on /new.
      if (id && !isEdit) router.push(`/broadcasts/${id}`);
    } finally {
      setBusy(null);
    }
  }

  if (channels.length === 0) {
    return (
      <>
        <PageHeader backHref="/broadcasts" backLabel="Broadcasts" title="New broadcast" />
        <EmptyState
          tone="orange"
          icon={Plug}
          title="Connect an account first"
          description="Broadcasts go out from a connected Instagram account or Facebook Page."
          action={
            <Button asChild>
              <Link href="/dashboard?accounts=1">Connect account</Link>
            </Button>
          }
        />
      </>
    );
  }

  const scheduledDate = fromDatetimeLocal(scheduledLocal, timeZone);
  const minLocal = toDatetimeLocal(new Date(Date.now() + 5 * 60_000), timeZone);
  const meta = statusMeta(status);
  const eligible = estimate?.eligible ?? 0;
  const isReview = step === STEPS.length - 1;
  const stepId = STEPS[step].id;

  const primary = isReview ? (
    scheduleMode === "later" ? (
      <Button onClick={() => void schedule()} loading={busy === "schedule"} disabled={busy !== null && busy !== "schedule"}>
        <CalendarClock /> {scheduledDate ? `Schedule for ${formatDateTime(scheduledDate, timeZone)}` : "Schedule"}
      </Button>
    ) : (
      <Button variant="highlight" onClick={() => void sendNow()} loading={busy === "send"} disabled={(busy !== null && busy !== "send") || estimating || eligible === 0}>
        <Send /> {estimate && eligible === 0 ? "No one can get it right now" : `Send to ${formatCount(eligible)} ${eligible === 1 ? "person" : "people"}`}
      </Button>
    )
  ) : (
    <Button onClick={next}>
      Continue <ArrowRight />
    </Button>
  );

  return (
    <>
      <div ref={topRef} className="scroll-mt-6" />
      <PageHeader
        backHref="/broadcasts"
        backLabel="Broadcasts"
        title={isEdit ? name.trim() || "Broadcast" : "New broadcast"}
        actions={
          <>
            {isEdit ? <Badge variant={meta.variant}>{meta.label}</Badge> : null}
            <Button type="button" variant="outline" size="sm" onClick={() => void saveDraft()} loading={busy === "draft"} disabled={busy !== null && busy !== "draft"}>
              <Save />
              {isEdit ? "Save" : "Save draft"}
            </Button>
          </>
        }
      />

      <Stepper steps={STEPS} current={step} reachable={reachable} onStep={goTo} tone="orange" className="mb-8" />

      <div className="grid grid-cols-1 gap-8 pb-28 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div key={stepId} className={cn("min-w-0", direction === "forward" ? "animate-slide-in-right" : "animate-slide-in-left")}>
          {stepId === "audience" ? (
            <section>
              <StepTitle title="Who gets it" />

              <div className="space-y-2">
                <Label>Account</Label>
                <div role="radiogroup" aria-label="Account" className="grid gap-2 sm:grid-cols-2">
                  {channels.map((c) => {
                    const selected = c.id === channelId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setChannelId(c.id)}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl border-2 p-3 text-left outline-none transition-[border-color,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                          selected ? "border-ink bg-orange-soft" : "border-border bg-card hover:border-ink/30",
                        )}
                      >
                        <PlatformMark platform={c.platform} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold">{channelLabel(c)}</span>
                          <span className="block text-[12px] text-muted-foreground">{c.platform === "FACEBOOK" ? "Messenger" : "Instagram"}</span>
                        </span>
                        {c.status !== "ACTIVE" ? <Badge variant="warning">Reconnect</Badge> : null}
                      </button>
                    );
                  })}
                </div>
                {errors.channelId ? (
                  <FieldError>{errors.channelId}</FieldError>
                ) : channel && channel.status !== "ACTIVE" ? (
                  <p className="text-[12px] font-medium text-orange-ink">
                    This account needs reconnecting.{" "}
                    <Link href="/dashboard?accounts=1" className="underline underline-offset-2">
                      Go to Channels
                    </Link>
                  </p>
                ) : null}
              </div>

              <div className="mt-8 space-y-2">
                <Label>People</Label>
                <div role="radiogroup" aria-label="Audience" className="grid gap-2 sm:grid-cols-3">
                  <OptionCard selected={audienceMode === "everyone"} onClick={() => chooseAudienceMode("everyone")} icon={Users} title="Everyone" detail="All contacts on this account" />
                  <OptionCard
                    selected={audienceMode === "segment"}
                    onClick={() => chooseAudienceMode("segment")}
                    icon={Layers}
                    title="A saved segment"
                    detail={segmentsLoaded && segmentOptions.length === 0 ? "None saved yet" : "From Contacts"}
                    disabled={segmentsLoaded && segmentOptions.length === 0}
                  />
                  <OptionCard selected={audienceMode === "filter"} onClick={() => chooseAudienceMode("filter")} icon={Filter} title="By tag" detail="Include or leave out tags" />
                </div>
              </div>

              {audienceMode === "segment" ? (
                <div className="mt-4 animate-fade-in space-y-2">
                  {segmentOptions.map((s) => {
                    const selected = audience.segmentId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => applySegment(s.id)}
                        aria-pressed={selected}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                          selected ? "border-ink bg-fog" : "hover:border-ink/30",
                        )}
                      >
                        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", selected ? "bg-ink text-white" : "bg-green-soft text-green-ink")}>
                          <Layers className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{s.name}</span>
                        <span className="text-[13px] tabular-nums text-muted-foreground">{formatCount(s.count)}</span>
                      </button>
                    );
                  })}
                  {audience.segmentId && !activeSegment && segmentsLoaded ? <p className="text-[12px] text-muted-foreground">That segment was deleted. Its filters still apply.</p> : null}
                </div>
              ) : null}

              {audienceMode === "filter" ? (
                <div className="mt-4 animate-fade-in space-y-5 rounded-2xl bg-fog p-4 sm:p-5">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label htmlFor="bc-tags">Include people tagged</Label>
                      <Segmented<"any" | "all">
                        value={audience.tagMode}
                        onChange={(tagMode) => updateAudience({ tagMode })}
                        options={[
                          { value: "any", label: "Any of these" },
                          { value: "all", label: "All of these" },
                        ]}
                        size="sm"
                        className="w-auto bg-background"
                        aria-label="Tag match"
                      />
                    </div>
                    <TagPicker id="bc-tags" value={audience.tags} onChange={(tags) => updateAudience({ tags })} options={tagOptions} emptyLabel="No tags picked" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bc-exclude">Leave out people tagged</Label>
                    <TagPicker id="bc-exclude" value={audience.excludeTags} onChange={(excludeTags) => updateAudience({ excludeTags })} options={tagOptions} emptyLabel="Nobody left out" />
                  </div>
                </div>
              ) : null}

              {audienceMode !== "segment" ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setMoreFilters((v) => !v)}
                    aria-expanded={moreFilters}
                    className="inline-flex items-center gap-1.5 rounded-full py-1 text-[13px] font-semibold text-muted-foreground outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    More filters
                    <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", moreFilters && "rotate-180")} />
                  </button>
                  {moreFilters ? (
                    <div className="mt-3 grid animate-fade-in gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="bc-last-interaction">Last active</Label>
                        <Select
                          value={audience.lastInteractionDays ? String(audience.lastInteractionDays) : ANY_TIME}
                          onValueChange={(v) => {
                            updateAudience({ lastInteractionDays: v === ANY_TIME ? null : Number(v) });
                            if (audienceMode === "everyone") setAudienceMode("filter");
                          }}
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
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            id="bc-q"
                            value={audience.q}
                            onChange={(e) => {
                              updateAudience({ q: e.target.value });
                              if (audienceMode === "everyone") setAudienceMode("filter");
                            }}
                            className="pl-9"
                            maxLength={120}
                            autoComplete="off"
                          />
                        </div>
                      </div>
                      {channel?.platform !== "FACEBOOK" ? (
                        <div className="flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 sm:col-span-2">
                          <Label htmlFor="bc-followers" className="cursor-pointer">
                            Only people who follow you
                          </Label>
                          <Switch
                            id="bc-followers"
                            checked={audience.onlyFollowers}
                            onCheckedChange={(onlyFollowers) => {
                              updateAudience({ onlyFollowers });
                              if (audienceMode === "everyone") setAudienceMode("filter");
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {stepId === "message" ? (
            <section>
              <StepTitle title="What it says" />
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="bc-text">Text</Label>
                    <span className={cn("text-[12px] tabular-nums text-muted-foreground", textUsage.value > textUsage.max && "font-semibold text-destructive")}>
                      {formatCount(textUsage.value)} / {formatCount(textUsage.max)}
                    </span>
                  </div>
                  <Textarea
                    id="bc-text"
                    ref={textRef}
                    value={draft.text}
                    onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                    placeholder="Hi {{first_name}}, the winter collection is live. Tap below to see it."
                    rows={6}
                    aria-invalid={errors.text ? true : undefined}
                    autoFocus
                  />
                  <div className="flex flex-wrap items-center gap-1">
                    {TEMPLATE_VARS.map((v) => (
                      <button
                        key={v.token}
                        type="button"
                        onClick={() => insertVar(v.token)}
                        className="inline-flex items-center gap-1 rounded-full bg-orange-soft px-2.5 py-1 text-[12px] font-semibold text-orange-ink transition-colors hover:bg-orange hover:text-ink"
                      >
                        <Plus className="h-3 w-3" strokeWidth={3} />
                        {v.label}
                      </button>
                    ))}
                  </div>
                  <FieldError>{errors.text}</FieldError>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Link buttons</Label>
                    <span className="text-[12px] tabular-nums text-muted-foreground">
                      {draft.buttons.length} / {MAX_BUTTONS}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {draft.buttons.map((b, i) => (
                      <div key={i} className="grid animate-fade-in gap-2 rounded-2xl bg-fog p-2 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]">
                        <Input value={b.title} onChange={(e) => updateButton(i, { title: e.target.value })} placeholder="Shop now" maxLength={BUTTON_TITLE_MAX_CHARS} aria-label={`Button ${i + 1} label`} />
                        <div className="relative">
                          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input value={b.url} onChange={(e) => updateButton(i, { url: e.target.value })} placeholder="https://" className="pl-9" inputMode="url" aria-label={`Button ${i + 1} link`} />
                        </div>
                        <Button type="button" variant="ghost" size="icon" aria-label="Remove button" onClick={() => setDraft((d) => ({ ...d, buttons: d.buttons.filter((_, j) => j !== i) }))}>
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <FieldError>{errors.buttons}</FieldError>
                  {draft.buttons.length < MAX_BUTTONS ? (
                    <Button type="button" variant="secondary" size="sm" onClick={() => setDraft((d) => ({ ...d, buttons: [...d.buttons, { title: "", url: "" }] }))}>
                      <Plus /> Add button
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bc-image">Image link</Label>
                  <div className="relative">
                    <ImageIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="bc-image"
                      value={draft.imageUrl}
                      onChange={(e) => setDraft((d) => ({ ...d, imageUrl: e.target.value }))}
                      placeholder="https://yourshop.com/images/winter.jpg"
                      className="pl-9"
                      inputMode="url"
                      aria-invalid={errors.imageUrl ? true : undefined}
                    />
                  </div>
                  {errors.imageUrl ? <FieldError>{errors.imageUrl}</FieldError> : <p className="text-[12px] text-muted-foreground">Optional. Sent before the text.</p>}
                </div>
              </div>
            </section>
          ) : null}

          {stepId === "when" ? (
            <section>
              <StepTitle title="When it goes out" />
              <div role="radiogroup" aria-label="When" className="grid gap-2 sm:grid-cols-2">
                <OptionCard selected={scheduleMode === "now"} onClick={() => setScheduleMode("now")} icon={Send} title="Send now" detail="After you review it" />
                <OptionCard selected={scheduleMode === "later"} onClick={() => setScheduleMode("later")} icon={CalendarClock} title="Schedule" detail="Pick a date and time" />
              </div>

              {scheduleMode === "later" ? (
                <div className="mt-6 animate-fade-in space-y-3 sm:max-w-md">
                  <div className="flex flex-wrap gap-1.5">
                    {quickTimes(timeZone).map((t) => (
                      <button
                        key={t.label}
                        type="button"
                        onClick={() => setScheduledLocal(t.value)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors",
                          scheduledLocal === t.value ? "border-ink bg-ink text-white" : "hover:border-ink/40",
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bc-when">Date and time</Label>
                    <Input
                      id="bc-when"
                      type="datetime-local"
                      value={scheduledLocal}
                      min={minLocal}
                      onChange={(e) => setScheduledLocal(e.target.value)}
                      aria-invalid={errors.schedule ? true : undefined}
                    />
                    {errors.schedule ? (
                      <FieldError>{errors.schedule}</FieldError>
                    ) : (
                      <p className="text-[12px] text-muted-foreground">
                        {timeZoneLabel(timeZone)}
                        {scheduledDate && scheduledDate.getTime() > Date.now() ? `, ${formatDistanceToNow(scheduledDate, { addSuffix: true })}` : ""}
                      </p>
                    )}
                  </div>
                  <p className="text-[12px] text-muted-foreground">Who can get it is counted again when it sends.</p>
                </div>
              ) : null}
            </section>
          ) : null}

          {stepId === "review" ? (
            <section>
              <StepTitle title="Check and send" />

              {isEdit && status === "SCHEDULED" && scheduledAtSaved ? (
                <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-sky-soft px-4 py-3 text-[13px]">
                  <CalendarClock className="h-4 w-4 text-sky-ink" />
                  <span className="flex-1">
                    Scheduled for <span className="font-semibold">{formatDateTime(scheduledAtSaved, timeZone)}</span> ({timeZoneAbbreviation(timeZone)})
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={() => void unschedule()} loading={busy === "unschedule"}>
                    Unschedule
                  </Button>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="bc-name">Name</Label>
                <Input id="bc-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX_CHARS} aria-invalid={errors.name ? true : undefined} autoComplete="off" />
                {errors.name ? <FieldError>{errors.name}</FieldError> : <p className="text-[12px] text-muted-foreground">Only your team sees it.</p>}
              </div>

              <dl className="mt-6 divide-y rounded-2xl border">
                {[
                  {
                    label: "From",
                    step: 0,
                    value: channel ? (
                      <span className="inline-flex items-center gap-2">
                        <PlatformMark platform={channel.platform} size={20} />
                        {channelLabel(channel)}
                      </span>
                    ) : (
                      "No account"
                    ),
                  },
                  {
                    label: "To",
                    step: 0,
                    value: (
                      <span>
                        {audienceLabel({ audience, segmentName: activeSegment?.name ?? null })}
                        <span className="text-muted-foreground"> · {estimate ? `${formatCount(eligible)} can get it now` : "counting"}</span>
                      </span>
                    ),
                  },
                  {
                    label: "Says",
                    step: 1,
                    value: (
                      <span className="line-clamp-2">
                        {draft.text.trim() || (draft.imageUrl ? "An image" : "Nothing yet")}
                        {outbound.buttons?.length ? <span className="text-muted-foreground"> · {outbound.buttons.length} {outbound.buttons.length === 1 ? "button" : "buttons"}</span> : null}
                      </span>
                    ),
                  },
                  {
                    label: "When",
                    step: 2,
                    value: scheduleMode === "later" ? (scheduledDate ? formatDateTime(scheduledDate, timeZone) : "Pick a time") : "Now",
                  },
                ].map((row) => (
                  <div key={row.label} className="flex items-start gap-4 px-4 py-3.5">
                    <dt className="brand-label w-12 shrink-0 pt-0.5 text-muted-foreground">{row.label}</dt>
                    <dd className="min-w-0 flex-1 text-[14px]">{row.value}</dd>
                    <button type="button" onClick={() => goTo(row.step)} className="shrink-0 text-[13px] font-semibold text-orange-ink hover:underline">
                      Edit
                    </button>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <ReachCard channelId={channelId} estimate={estimate} estimating={estimating} error={estimateError} />
          {stepId !== "audience" ? <MessagePreview message={outbound} platform={channel?.platform} senderName={channel ? channelLabel(channel) : undefined} className="animate-fade-in" /> : null}
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 backdrop-blur">
        <div className="flex items-center gap-3 px-5 py-3 md:px-8">
          <Button type="button" variant="ghost" onClick={() => goTo(step - 1)} disabled={step === 0} className={cn(step === 0 && "invisible")}>
            <ArrowLeft /> Back
          </Button>
          <span className="hidden flex-1 text-center text-[13px] text-muted-foreground sm:block">
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="flex-1 sm:hidden" />
          {primary}
        </div>
      </div>
    </>
  );
}

export { BroadcastEditor };
