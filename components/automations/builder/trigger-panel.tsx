"use client";

import * as React from "react";
import type { MatchMode, TriggerType } from "@prisma/client";
import { AtSign, Images, MessageCircle, MessageSquare, Plus, X } from "lucide-react";

import { TagInput } from "@/components/automations/tag-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlatformMark } from "@/components/ui/platform-badge";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ChannelOption, MediaSummary } from "@/lib/services/automations";
import { cn } from "@/lib/utils";

import type { BuilderAction, BuilderSettings } from "./builder-state";
import { MediaPicker, MediaThumb } from "./media-picker";

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3 border-b px-5 py-5 last:border-b-0", className)}>
      <h2 className="brand-label text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

const TRIGGER_OPTIONS: Array<{ value: TriggerType; label: string; icon: typeof MessageSquare; instagramOnly?: boolean }> = [
  { value: "COMMENT", label: "Comment", icon: MessageSquare },
  { value: "DM", label: "DM", icon: MessageCircle },
  { value: "STORY_REPLY", label: "Story reply", icon: AtSign, instagramOnly: true },
];

const MATCH_OPTIONS: Array<{ value: MatchMode; label: string }> = [
  { value: "CONTAINS", label: "Contains" },
  { value: "EXACT", label: "Whole word" },
  { value: "ANY", label: "Any text" },
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
  const [postScope, setPostScope] = React.useState<"all" | "specific">(settings.mediaIds.length > 0 ? "specific" : "all");
  const channel = channels.find((c) => c.id === settings.channelId);
  const isFacebook = channel?.platform === "FACEBOOK";
  const subject = settings.triggerType === "COMMENT" ? "comment" : settings.triggerType === "DM" ? "message" : "story reply";

  return (
    <div className="flex flex-col">
      <Section title="Account">
        <Select value={settings.channelId} onValueChange={(v) => set({ channelId: v })}>
          <SelectTrigger aria-label="Account">
            <SelectValue placeholder="Pick an account" />
          </SelectTrigger>
          <SelectContent>
            {channels.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="inline-flex items-center gap-2">
                  <PlatformMark platform={c.platform} size={18} />
                  {channelLabel(c)}
                  {c.status !== "ACTIVE" ? <span className="text-[11px] font-semibold text-orange-ink">Reconnect</span> : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {channel && channel.status !== "ACTIVE" ? <p className="text-[12px] font-medium text-orange-ink">Reconnect this account from the dashboard to go live.</p> : null}
      </Section>

      <Section title="Starts when someone sends a">
        <div role="radiogroup" aria-label="Trigger" className="grid grid-cols-3 gap-2">
          {TRIGGER_OPTIONS.map((o) => {
            const active = settings.triggerType === o.value;
            const unavailable = Boolean(o.instagramOnly && isFacebook);
            const Icon = o.icon;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={unavailable && !active}
                title={unavailable ? "Instagram only" : undefined}
                onClick={() => set({ triggerType: o.value })}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl border-2 px-2 py-3 text-[12px] font-semibold outline-none transition-[background-color,border-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]",
                  active ? "border-ink bg-yellow text-ink" : "border-transparent bg-fog text-ink hover:border-ink/20",
                  unavailable && "cursor-not-allowed opacity-45 hover:border-transparent",
                  unavailable && active && "border-destructive bg-destructive/10 opacity-100",
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                {o.label}
              </button>
            );
          })}
        </div>
        {isFacebook && settings.triggerType === "STORY_REPLY" ? <p className="text-[12px] font-medium text-destructive">Facebook Pages have no story replies. Pick Comment or DM.</p> : null}
      </Section>

      <Section title="Keywords">
        <Segmented<MatchMode> value={settings.matchMode} onChange={(v) => set({ matchMode: v })} options={MATCH_OPTIONS} size="sm" aria-label="Match mode" />
        {!isAny ? (
          <div className="space-y-1.5">
            <Label htmlFor="keywords">Run on</Label>
            <TagInput id="keywords" value={settings.keywords} onChange={(keywords) => set({ keywords })} placeholder="link, price, 🔥" />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="exclude-keywords">Never run on</Label>
          <TagInput id="exclude-keywords" value={settings.excludeKeywords} onChange={(excludeKeywords) => set({ excludeKeywords })} placeholder="spam, unsubscribe" />
        </div>
      </Section>

      {isComment ? (
        <Section title="Posts">
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
            size="sm"
            aria-label="Post scope"
          />
          {postScope === "specific" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {settings.mediaIds.map((id) => (
                  <div key={id} className="group relative h-14 w-14 overflow-hidden rounded-xl">
                    <MediaThumb item={mediaById[id]} className="h-full w-full" />
                    <button
                      type="button"
                      aria-label="Remove post"
                      onClick={() => set({ mediaIds: settings.mediaIds.filter((m) => m !== id) })}
                      className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-ink text-white group-hover:flex"
                    >
                      <X className="h-2.5 w-2.5" strokeWidth={3} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-purple hover:text-purple"
                  aria-label="Choose posts"
                >
                  {settings.mediaIds.length === 0 ? <Images className="h-5 w-5" strokeWidth={1.75} /> : <Plus className="h-5 w-5" />}
                </button>
              </div>
              {settings.mediaIds.length === 0 ? <p className="text-[12px] text-muted-foreground">Until you pick some, it runs on every post.</p> : null}
            </div>
          ) : null}
        </Section>
      ) : null}

      {isComment ? (
        <Section title="Reply under the comment">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="public-reply" className="font-normal">
              Post a public reply
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
                  <Button variant="ghost" size="icon" className="shrink-0" aria-label="Remove reply" onClick={() => set({ publicReplies: settings.publicReplies.filter((_, j) => j !== i) })}>
                    <X />
                  </Button>
                </div>
              ))}
              <Button variant="secondary" size="sm" disabled={settings.publicReplies.length >= 25} onClick={() => set({ publicReplies: [...settings.publicReplies, ""] })}>
                <Plus /> Add a variation
              </Button>
              {settings.publicReplies.filter((r) => r.trim()).length === 0 ? (
                <p className="text-[12px] font-medium text-orange-ink">Add at least one reply.</p>
              ) : (
                <p className="text-[12px] text-muted-foreground">One is picked at random each time.</p>
              )}
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section title="Repeats">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label htmlFor="once-per-contact" className="font-normal">
              Once per person
            </Label>
            <p className="mt-1 text-[12px] text-muted-foreground">Skips anyone who already got it, even if they send another {subject}.</p>
          </div>
          <Switch id="once-per-contact" checked={settings.oncePerContact} onCheckedChange={(on) => set({ oncePerContact: on })} />
        </div>
      </Section>

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
