"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { TriggerType } from "@prisma/client";
import { Check, LayoutTemplate, PenLine, Plug, Search, SearchX, X } from "lucide-react";

import { apiFetch, errorMessage } from "@/components/automations/api";
import { TRIGGER_STYLE } from "@/components/automations/badges";
import { channelHandle } from "@/components/automations/channel-label";
import { GOAL_ORDER, GOAL_STYLE, TemplateGallery, type TemplateSection } from "@/components/automations/template-gallery";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PlatformMark } from "@/components/ui/platform-badge";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { toast } from "@/components/ui/sonner";
import { TONES } from "@/components/ui/tone";
import type { AutomationDetail, ChannelOption } from "@/lib/services/automations";
import type { TemplateGoal, TemplatePlatform, TemplateSummary } from "@/lib/services/templates";
import { cn } from "@/lib/utils";

const SCRATCH = "__scratch__";

const TRIGGER_ORDER: readonly TriggerType[] = ["COMMENT", "DM", "STORY_REPLY"];

function platformLabel(platform: TemplatePlatform): string {
  return platform === "INSTAGRAM" ? "Instagram" : "Messenger";
}

function channelPlatform(channel: ChannelOption): TemplatePlatform {
  return channel.platform === "INSTAGRAM" ? "INSTAGRAM" : "MESSENGER";
}

function InstagramGlyph({ className }: { className?: string }) {
  return <PlatformIcon platform="INSTAGRAM" size={14} className={className} />;
}

function MessengerGlyph({ className }: { className?: string }) {
  return <PlatformIcon platform="FACEBOOK" size={14} className={className} />;
}

const PLATFORM_OPTIONS: SegmentedOption<TemplatePlatform>[] = [
  { value: "INSTAGRAM", label: "Instagram", icon: InstagramGlyph },
  { value: "MESSENGER", label: "Messenger", icon: MessengerGlyph },
];

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-ink bg-ink text-white" : "border-border bg-background text-muted-foreground hover:border-ink/30 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** A row of chips that scrolls sideways on a phone and wraps on a wider screen. */
function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="scrollbar-none -mx-5 flex items-center gap-1.5 overflow-x-auto px-5 md:mx-0 md:min-w-0 md:flex-1 md:flex-wrap md:overflow-visible md:px-0"
    >
      {children}
    </div>
  );
}

/** The connected accounts as a radio list: the platform tile, the handle, and the Page name when there is one. */
function AccountChoice({
  channels,
  value,
  onChange,
  disabled,
}: {
  channels: ChannelOption[];
  value: string;
  onChange: (channelId: string) => void;
  disabled?: boolean;
}) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const hasValue = channels.some((c) => c.id === value);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + channels.length) % channels.length;
    onChange(channels[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Account" className="space-y-2">
      {channels.map((channel, i) => {
        const selected = channel.id === value;
        return (
          <button
            key={channel.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (!hasValue && i === 0) ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(channel.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
              selected ? "border-ink bg-fog/60" : "border-border hover:border-ink/30",
            )}
          >
            <PlatformMark platform={channel.platform} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-ink">{channelHandle(channel)}</span>
              {channel.username && channel.name ? <span className="block truncate text-[12px] text-muted-foreground">{channel.name}</span> : null}
            </span>
            <span
              aria-hidden
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
                selected ? "border-ink bg-ink text-white" : "border-input bg-background",
              )}
            >
              {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface TemplateDialogProps {
  templates: TemplateSummary[];
  /** Connected accounts in ACTIVE state. The dialog refuses to create without one. */
  channels: ChannelOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** From /automations?template=<id>, so an old deep link still starts that template. */
  autoTemplateId?: string;
}

/**
 * The template picker.
 *
 * Templates are written for one platform at a time (a Facebook Page has no
 * story replies and no follow gate), so the first choice is a side: Instagram
 * or Messenger. Goal and trigger chips narrow it from there, together with the
 * search box.
 */
export function TemplateDialog({ templates, channels, open, onOpenChange, autoTemplateId }: TemplateDialogProps) {
  const router = useRouter();

  const available = React.useMemo(() => {
    const set = new Set<TemplatePlatform>();
    for (const channel of channels) set.add(channelPlatform(channel));
    return set;
  }, [channels]);

  const [platform, setPlatform] = React.useState<TemplatePlatform>(() =>
    channels[0] ? channelPlatform(channels[0]) : "INSTAGRAM",
  );
  const [goal, setGoal] = React.useState<TemplateGoal | null>(null);
  const [trigger, setTrigger] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [pending, setPending] = React.useState<string | null>(null);
  // With one matching account we just go; with several we ask which.
  const [pickFor, setPickFor] = React.useState<string | null>(null);
  const [channelId, setChannelId] = React.useState("");

  // Reopening should not resume someone else's half-finished search.
  React.useEffect(() => {
    if (!open) return;
    setGoal(null);
    setTrigger(null);
    setQuery("");
    setPending(null);
    setPickFor(null);
  }, [open]);

  const forPlatform = React.useMemo(() => templates.filter((t) => t.platform === platform), [templates, platform]);

  const goals = React.useMemo(() => GOAL_ORDER.filter((g) => forPlatform.some((t) => t.goal === g)), [forPlatform]);
  const triggers = React.useMemo(() => {
    const byLabel = new Map<string, TriggerType>();
    for (const t of forPlatform) if (!byLabel.has(t.triggerLabel)) byLabel.set(t.triggerLabel, t.triggerType);
    return [...byLabel]
      .map(([label, type]) => ({ label, type }))
      .sort((a, b) => TRIGGER_ORDER.indexOf(a.type) - TRIGGER_ORDER.indexOf(b.type));
  }, [forPlatform]);

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return forPlatform.filter((t) => {
      if (goal && t.goal !== goal) return false;
      if (trigger && t.triggerLabel !== trigger) return false;
      if (!needle) return true;
      return (
        t.name.toLowerCase().includes(needle) ||
        t.description.toLowerCase().includes(needle) ||
        t.keywords.some((k) => k.toLowerCase().includes(needle))
      );
    });
  }, [forPlatform, goal, trigger, query]);

  // "Recommended" only earns its own section when nothing is being filtered down.
  const browsing = goal === null && trigger === null && query.trim() === "";
  const sections: TemplateSection[] = React.useMemo(() => {
    if (!browsing) return [{ templates: visible }];
    const recommended = visible.filter((t) => t.popular).concat(visible.filter((t) => !t.popular).slice(0, 2));
    const recommendedIds = new Set(recommended.map((t) => t.id));
    return [
      { title: "Recommended", templates: recommended },
      { title: "More templates", templates: visible.filter((t) => !recommendedIds.has(t.id)) },
    ];
  }, [browsing, visible]);

  const matchingChannels = React.useMemo(
    () => channels.filter((c) => channelPlatform(c) === platform),
    [channels, platform],
  );

  const create = React.useCallback(
    async (templateId: string, chosenChannelId: string) => {
      setPending(templateId);
      try {
        const { automation } = await apiFetch<{ automation: AutomationDetail }>("/api/automations", {
          method: "POST",
          json: { channelId: chosenChannelId, ...(templateId === SCRATCH ? {} : { templateId }) },
        });
        toast.success(`Created “${automation.name}”`);
        router.push(`/automations/${automation.id}`);
      } catch (err) {
        toast.error(errorMessage(err, "Couldn't create the automation"));
        setPending(null);
      }
    },
    [router],
  );

  function choose(templateId: string) {
    if (matchingChannels.length === 0) {
      toast.error(platform === "INSTAGRAM" ? "Connect an Instagram account first" : "Connect a Facebook Page first", {
        action: { label: "Connect", onClick: () => router.push("/dashboard?accounts=1") },
      });
      return;
    }
    if (matchingChannels.length === 1) {
      void create(templateId, matchingChannels[0].id);
      return;
    }
    setChannelId(matchingChannels[0].id);
    setPickFor(templateId);
  }

  function changePlatform(next: TemplatePlatform) {
    setPlatform(next);
    setGoal(null);
    setTrigger(null);
  }

  function clearFilters() {
    setGoal(null);
    setTrigger(null);
    setQuery("");
  }

  // A deep link names the template it wants; run it once and let the dialog
  // stay open behind the redirect in case creation fails.
  const autoStarted = React.useRef(false);
  React.useEffect(() => {
    if (!open || !autoTemplateId || autoStarted.current) return;
    const wanted = templates.find((t) => t.id === autoTemplateId);
    if (!wanted) return;
    autoStarted.current = true;
    setPlatform(wanted.platform);
    const usable = channels.filter((c) => channelPlatform(c) === wanted.platform);
    if (usable.length === 1) void create(wanted.id, usable[0].id);
    else if (usable.length > 1) {
      setChannelId(usable[0].id);
      setPickFor(wanted.id);
    }
  }, [open, autoTemplateId, templates, channels, create]);

  const picked = pickFor && pickFor !== SCRATCH ? templates.find((t) => t.id === pickFor) : null;
  const busy = pending !== null;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
        <DialogContent
          hideClose
          className="flex h-[92dvh] w-full max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:h-[88vh] sm:max-h-[880px] sm:w-[calc(100vw-2rem)]"
        >
          <DialogHeader className="flex-row flex-wrap items-center gap-x-5 gap-y-3 space-y-0 border-b px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span aria-hidden className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", TONES.purple.solid)}>
                <LayoutTemplate className="h-[18px] w-[18px]" strokeWidth={2} />
              </span>
              <DialogTitle className="truncate pr-0">Templates</DialogTitle>
              <DialogDescription className="sr-only">Pick a ready-made automation, or start from an empty canvas.</DialogDescription>
            </div>
            <Segmented
              value={platform}
              onChange={changePlatform}
              options={PLATFORM_OPTIONS}
              aria-label="Platform"
              className="order-last w-full sm:order-none sm:w-auto"
            />
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => choose(SCRATCH)} disabled={busy} className="hidden md:inline-flex">
                <PenLine /> Start from scratch
              </Button>
              <DialogPrimitive.Close
                aria-label="Close"
                disabled={busy}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-fog hover:text-ink focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {/* Stays in view on a wide screen; on a phone it scrolls away so the cards get the room. */}
            <div className="space-y-3 border-b px-5 py-4 md:sticky md:top-0 md:z-10 md:bg-background">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative w-full md:w-72 md:shrink-0">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Search ${platformLabel(platform)} templates`}
                    aria-label={`Search ${platformLabel(platform)} templates`}
                    className="pl-10"
                  />
                </div>
                <ChipRow label="Trigger">
                  <FilterChip active={trigger === null} onClick={() => setTrigger(null)}>
                    Any trigger
                  </FilterChip>
                  {triggers.map(({ label, type }) => {
                    const active = trigger === label;
                    const Icon = TRIGGER_STYLE[type].icon;
                    return (
                      <FilterChip key={label} active={active} onClick={() => setTrigger(active ? null : label)}>
                        <Icon className={cn("h-3.5 w-3.5", active ? null : TONES[TRIGGER_STYLE[type].tone].text)} strokeWidth={2.25} aria-hidden />
                        {label}
                      </FilterChip>
                    );
                  })}
                </ChipRow>
              </div>
              <ChipRow label="Goal">
                <FilterChip active={goal === null} onClick={() => setGoal(null)}>
                  All goals
                </FilterChip>
                {goals.map((g) => {
                  const active = goal === g;
                  return (
                    <FilterChip key={g} active={active} onClick={() => setGoal(active ? null : g)}>
                      <span aria-hidden className={cn("h-2 w-2 rounded-full", TONES[GOAL_STYLE[g].tone].dot)} />
                      {g}
                    </FilterChip>
                  );
                })}
              </ChipRow>
              <Button variant="outline" onClick={() => choose(SCRATCH)} disabled={busy} className="w-full sm:w-auto md:hidden">
                <PenLine /> Start from scratch
              </Button>
            </div>

            <div className="px-5 pb-8 pt-5">
              {available.has(platform) ? null : (
                <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-yellow-soft px-4 py-3">
                  <PlatformMark platform={platform === "INSTAGRAM" ? "INSTAGRAM" : "FACEBOOK"} size={28} />
                  <p className="min-w-0 flex-1 text-[13px] font-semibold text-ink">
                    {platform === "INSTAGRAM" ? "Connect an Instagram account to use these templates." : "Connect a Facebook Page to use these templates."}
                  </p>
                  <Button size="sm" asChild>
                    <Link href="/dashboard?accounts=1">
                      <Plug /> Connect account
                    </Link>
                  </Button>
                </div>
              )}

              {visible.length === 0 ? (
                <EmptyState
                  compact
                  tone="purple"
                  icon={SearchX}
                  title="No templates match"
                  action={
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <>
                  {browsing ? null : (
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <p className="text-[13px] text-muted-foreground">
                        <span className="font-semibold tabular-nums text-ink">{visible.length}</span> {visible.length === 1 ? "template" : "templates"}
                      </p>
                      <Button variant="link" size="sm" onClick={clearFilters} className="px-0">
                        Clear filters
                      </Button>
                    </div>
                  )}
                  <TemplateGallery sections={sections} pendingId={pending} onChoose={choose} />
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pickFor !== null} onOpenChange={(next) => !next && !busy && setPickFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Which account?</DialogTitle>
            <DialogDescription className="truncate">{picked ? picked.name : "Blank automation"}</DialogDescription>
          </DialogHeader>
          <AccountChoice channels={matchingChannels} value={channelId} onChange={setChannelId} disabled={busy} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickFor(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => pickFor && channelId && create(pickFor, channelId)} disabled={!channelId} loading={busy}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
