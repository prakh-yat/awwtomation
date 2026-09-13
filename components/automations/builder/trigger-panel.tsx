"use client";

import * as React from "react";
import type { MatchMode, TriggerType } from "@prisma/client";
import { Images, Info, MessageCircle, MessageSquare, Plus, Sparkles, X } from "lucide-react";

import { TagInput } from "@/components/automations/tag-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ChannelOption, MediaSummary } from "@/lib/services/automations";
import { cn } from "@/lib/utils";

import type { BuilderAction, BuilderSettings } from "./builder-state";
import { MediaPicker, MediaThumb } from "./media-picker";
import { Segmented } from "./segmented";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="border-b px-5 py-5 last:border-b-0">
      <h2 className="text-sm font-medium">{title}</h2>
      {description ? <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p> : null}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[12px] text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const TRIGGER_OPTIONS: Array<{ value: TriggerType; label: string; icon: typeof MessageSquare }> = [
  { value: "COMMENT", label: "Comment", icon: MessageSquare },
  { value: "DM", label: "DM", icon: MessageCircle },
  { value: "STORY_REPLY", label: "Story reply", icon: Sparkles },
];

const MATCH_OPTIONS: Array<{ value: MatchMode; label: string }> = [
  { value: "CONTAINS", label: "Contains" },
  { value: "EXACT", label: "Exact word" },
  { value: "ANY", label: "Any" },
];

function channelLabel(c: ChannelOption): string {
  return c.username ? `@${c.username}` : (c.name ?? "Unnamed account");
}

export type TriggerPanelProps = {
  settings: BuilderSettings;
  channels: ChannelOption[];
  mediaById: Record<string, MediaSummary>;
  dispatch: React.Dispatch<BuilderAction>;
};

export function TriggerPanel({ settings, channels, mediaById, dispatch }: TriggerPanelProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const set = React.useCallback((patch: Partial<BuilderSettings>) => dispatch({ type: "settings", patch }), [dispatch]);
  const onMediaLoaded = React.useCallback((items: MediaSummary[]) => dispatch({ type: "mediaLoaded", items }), [dispatch]);

  const isComment = settings.triggerType === "COMMENT";
  const isAny = settings.matchMode === "ANY";
  const specificPosts = settings.mediaIds.length > 0;
  const [postScope, setPostScope] = React.useState<"all" | "specific">(specificPosts ? "specific" : "all");
  const channel = channels.find((c) => c.id === settings.channelId);
  const subject = settings.triggerType === "COMMENT" ? "comment" : settings.triggerType === "DM" ? "message" : "story reply";

  return (
    <div className="flex flex-col">
      <Section title="Account" description="The Instagram account or Facebook Page this automation replies from.">
        <Select value={settings.channelId} onValueChange={(v) => set({ channelId: v })}>
          <SelectTrigger aria-label="Account">
            <SelectValue placeholder="Pick an account" />
          </SelectTrigger>
          <SelectContent>
            {channels.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="inline-flex items-center gap-2">
                  <PlatformIcon platform={c.platform} size={12} className="text-muted-foreground" />
                  {channelLabel(c)}
                  {c.status !== "ACTIVE" ? <span className="text-[11px] text-warning">· {c.status.toLowerCase().replace("_", " ")}</span> : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {channel && channel.status !== "ACTIVE" ? (
          <p className="text-[12px] text-warning">This account needs to be reconnected before the automation can go live.</p>
        ) : null}
      </Section>

      <Section title="Trigger" description="What makes it run.">
        <Segmented<TriggerType> value={settings.triggerType} onChange={(v) => set({ triggerType: v })} options={TRIGGER_OPTIONS} aria-label="Trigger type" />

        <Field label="Matching">
          <Segmented<MatchMode> value={settings.matchMode} onChange={(v) => set({ matchMode: v })} options={MATCH_OPTIONS} aria-label="Match mode" />
          <p className="text-[11px] text-muted-foreground">
            {settings.matchMode === "CONTAINS"
              ? `Runs when the ${subject} contains a keyword anywhere. Capital letters don't matter.`
              : settings.matchMode === "EXACT"
                ? `Runs when a keyword appears as a whole word in the ${subject}.`
                : `Runs on every ${subject}. Excluded words still apply.`}
          </p>
        </Field>

        {!isAny ? (
          <Field label="Keywords" htmlFor="keywords" hint="Press Enter or comma to add. Emoji work too.">
            <TagInput id="keywords" value={settings.keywords} onChange={(keywords) => set({ keywords })} placeholder="link, price, 🔥" />
          </Field>
        ) : null}

        <Field label="Exclude keywords" htmlFor="exclude-keywords" hint={`Skip any ${subject} containing one of these.`}>
          <TagInput id="exclude-keywords" value={settings.excludeKeywords} onChange={(excludeKeywords) => set({ excludeKeywords })} placeholder="spam, unsubscribe" />
        </Field>

        {isComment ? (
          <Field label="Posts">
            <Segmented<"all" | "specific">
              value={postScope}
              onChange={(v) => {
                setPostScope(v);
                if (v === "all") set({ mediaIds: [] });
                else setPickerOpen(true);
              }}
              options={[
                { value: "all", label: "All posts" },
                { value: "specific", label: "Specific posts" },
              ]}
              aria-label="Post scope"
            />
            {postScope === "specific" ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {settings.mediaIds.map((id) => (
                    <div key={id} className="group relative h-12 w-12 overflow-hidden rounded-md border">
                      <MediaThumb item={mediaById[id]} className="h-full w-full" />
                      <button
                        type="button"
                        aria-label="Remove post"
                        onClick={() => set({ mediaIds: settings.mediaIds.filter((m) => m !== id) })}
                        className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-foreground text-white group-hover:flex"
                      >
                        <X className="h-2.5 w-2.5" strokeWidth={3} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-md border border-dashed text-muted-foreground transition-colors hover:border-foreground hover:text-foreground",
                    )}
                    aria-label="Choose posts"
                  >
                    {settings.mediaIds.length === 0 ? <Images className="h-4 w-4" strokeWidth={1.75} /> : <Plus className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {settings.mediaIds.length === 0
                    ? "No posts chosen yet. Until you pick some, it runs on all posts."
                    : `${settings.mediaIds.length} post${settings.mediaIds.length === 1 ? "" : "s"} selected.`}
                </p>
              </div>
            ) : null}
          </Field>
        ) : null}
      </Section>

      {isComment ? (
        <Section title="Public reply" description="Reply under the comment so others see the keyword works.">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="public-reply" className="text-[13px] font-normal">
              Reply publicly to the comment
            </Label>
            <Switch id="public-reply" checked={settings.publicReplyEnabled} onCheckedChange={(on) => set({ publicReplyEnabled: on })} />
          </div>
          {settings.publicReplyEnabled ? (
            <div className="space-y-2">
              {settings.publicReplies.map((reply, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    value={reply}
                    maxLength={500}
                    placeholder="Sent you a DM"
                    aria-label={`Public reply ${i + 1}`}
                    onChange={(e) => set({ publicReplies: settings.publicReplies.map((r, j) => (j === i ? e.target.value : r)) })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label="Remove reply"
                    onClick={() => set({ publicReplies: settings.publicReplies.filter((_, j) => j !== i) })}
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                disabled={settings.publicReplies.length >= 25}
                onClick={() => set({ publicReplies: [...settings.publicReplies, ""] })}
              >
                <Plus /> Add variant
              </Button>
              <p className="text-[11px] text-muted-foreground">One is picked at random for each comment so replies don&apos;t look robotic.</p>
              {settings.publicReplies.filter((r) => r.trim()).length === 0 ? (
                <p className="text-[11px] text-warning">Add at least one reply, or nothing will be posted.</p>
              ) : null}
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section title="Settings">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label htmlFor="once-per-contact" className="text-[13px] font-normal">
              Once per contact
            </Label>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Only send to each person once, even if they {isComment ? "comment again" : settings.triggerType === "DM" ? "message you again" : "reply to a story again"}.
            </p>
          </div>
          <Switch id="once-per-contact" checked={settings.oncePerContact} onCheckedChange={(on) => set({ oncePerContact: on })} />
        </div>
      </Section>

      <div className="px-5 py-5">
        <div className="rounded-lg border bg-secondary/50 p-3 text-[12px] leading-relaxed text-muted-foreground">
          <p className="mb-1 inline-flex items-center gap-1.5 font-medium text-foreground">
            <Info className="h-3.5 w-3.5" /> How an automation runs
          </p>
          <ul className="list-disc space-y-1 pl-4">
            <li>After each message it waits. It carries on when the person taps a button or replies.</li>
            <li>For comments, the first message goes to their DMs, linked to the comment they left.</li>
            <li>&ldquo;Next step&rdquo; buttons move to the step they&apos;re connected to. Link buttons open the link.</li>
          </ul>
        </div>
      </div>

      {isComment ? (
        <MediaPicker
          channelId={settings.channelId}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          selected={settings.mediaIds}
          onChange={(mediaIds) => set({ mediaIds })}
          onLoaded={onMediaLoaded}
        />
      ) : null}
    </div>
  );
}
