"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, PenLine, Search, X, Zap } from "lucide-react";

import { apiFetch, errorMessage } from "@/components/automations/api";
import { STEP_INFO } from "@/components/automations/builder/step-catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import type { AutomationDetail, ChannelOption } from "@/lib/services/automations";
import type { TemplatePlatform, TemplateSummary } from "@/lib/services/templates";
import { cn } from "@/lib/utils";

const SCRATCH = "__scratch__";

type Filter = { kind: "all" } | { kind: "goal"; value: string } | { kind: "trigger"; value: string };

const ALL: Filter = { kind: "all" };

function sameFilter(a: Filter, b: Filter): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "all" || b.kind === "all" || a.value === b.value;
}

function platformLabel(platform: TemplatePlatform): string {
  return platform === "INSTAGRAM" ? "Instagram" : "Messenger";
}

function channelPlatform(channel: ChannelOption): TemplatePlatform {
  return channel.platform === "INSTAGRAM" ? "INSTAGRAM" : "MESSENGER";
}

function StepChain({ template }: { template: TemplateSummary }) {
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
      {template.steps.map((step, i) => {
        const Icon = STEP_INFO[step.type].icon;
        return (
          <li key={i} className="flex items-center gap-1">
            <span className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-foreground">
              <Icon className="h-3 w-3" strokeWidth={1.75} />
              {step.label}
            </span>
            {i < template.steps.length - 1 ? <ArrowRight className="h-3 w-3" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function TemplateCard({
  template,
  pending,
  disabled,
  onChoose,
}: {
  template: TemplateSummary;
  pending: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChoose}
      className={cn(
        "group flex h-full flex-col rounded-xl border bg-card p-4 text-left transition-all",
        "hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-card",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[15px] font-semibold leading-snug">{template.name}</p>
        {template.popular ? (
          <Badge variant="warning" className="shrink-0">
            Popular
          </Badge>
        ) : null}
      </div>
      <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{template.description}</p>

      <div className="mt-4 flex-1" />

      <div className="border-t pt-3">
        <StepChain template={template} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[12px]">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <Zap className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <span className="truncate">{template.triggerLabel}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium">
          {pending ? "Creating" : "Use template"}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
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
 * story replies and no follow gate), so the first thing the dialog does is pick
 * a side: Instagram or Messenger. The rail below it narrows by goal or by what
 * sets the automation off, and the grid is filtered by all three plus the search box.
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
  const [filter, setFilter] = React.useState<Filter>(ALL);
  const [query, setQuery] = React.useState("");
  const [pending, setPending] = React.useState<string | null>(null);
  // With one matching account we just go; with several we ask which.
  const [pickFor, setPickFor] = React.useState<string | null>(null);
  const [channelId, setChannelId] = React.useState("");

  // Reopening should not resume someone else's half-finished search.
  React.useEffect(() => {
    if (!open) return;
    setFilter(ALL);
    setQuery("");
    setPending(null);
    setPickFor(null);
  }, [open]);

  const forPlatform = React.useMemo(() => templates.filter((t) => t.platform === platform), [templates, platform]);

  const goals = React.useMemo(() => [...new Set(forPlatform.map((t) => t.goal))], [forPlatform]);
  const triggers = React.useMemo(() => [...new Set(forPlatform.map((t) => t.triggerLabel))], [forPlatform]);

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return forPlatform.filter((t) => {
      if (filter.kind === "goal" && t.goal !== filter.value) return false;
      if (filter.kind === "trigger" && t.triggerLabel !== filter.value) return false;
      if (!needle) return true;
      return (
        t.name.toLowerCase().includes(needle) ||
        t.description.toLowerCase().includes(needle) ||
        t.keywords.some((k) => k.toLowerCase().includes(needle))
      );
    });
  }, [forPlatform, filter, query]);

  // "Recommended" only earns its own row when nothing is being filtered down.
  const browsing = filter.kind === "all" && query.trim() === "";
  const recommended = browsing ? visible.filter((t) => t.popular).concat(visible.filter((t) => !t.popular).slice(0, 2)) : [];
  const recommendedIds = new Set(recommended.map((t) => t.id));
  const rest = browsing ? visible.filter((t) => !recommendedIds.has(t.id)) : visible;

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
        toast.success(`Created "${automation.name}"`);
        router.push(`/automations/${automation.id}`);
      } catch (err) {
        toast.error(errorMessage(err, "Could not create the automation"));
        setPending(null);
      }
    },
    [router],
  );

  function choose(templateId: string) {
    if (matchingChannels.length === 0) {
      toast.error(`Connect a ${platformLabel(platform)} account first`, {
        description: "Templates run on a connected account.",
        action: { label: "Go to Channels", onClick: () => router.push("/channels") },
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

  const railButton = (label: string, target: Filter) => (
    <button
      key={label}
      type="button"
      onClick={() => setFilter(target)}
      className={cn(
        "w-full rounded-md px-3 py-1.5 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        sameFilter(filter, target) && filter.kind === target.kind
          ? "bg-secondary font-medium text-foreground"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
        <DialogContent
          hideClose
          className="flex h-[88vh] max-h-[880px] w-[calc(100vw-2rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0"
        >
          <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b px-5 py-4">
            <div className="min-w-0">
              <DialogTitle className="text-lg">Templates</DialogTitle>
              <DialogDescription className="sr-only">
                Pick a ready-made automation, or start from an empty canvas.
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => choose(SCRATCH)} disabled={busy}>
                <PenLine /> Start from scratch
              </Button>
              <DialogPrimitive.Close
                aria-label="Close"
                disabled={busy}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>
          </DialogHeader>

          <div className="border-b px-5 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${platformLabel(platform)} templates`}
                aria-label={`Search ${platformLabel(platform)} templates`}
                className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="grid min-h-0 flex-1 md:grid-cols-[216px_1fr]">
            <aside className="hidden min-h-0 flex-col overflow-y-auto border-r px-3 py-4 md:flex">
              {available.size > 1 ? (
                <div className="mb-4 flex gap-1 rounded-lg bg-secondary p-1">
                  {(["INSTAGRAM", "MESSENGER"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setPlatform(p);
                        setFilter(ALL);
                      }}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        platform === p ? "bg-background font-medium text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <PlatformIcon platform={p === "INSTAGRAM" ? "INSTAGRAM" : "FACEBOOK"} size={14} />
                      {platformLabel(p)}
                    </button>
                  ))}
                </div>
              ) : null}

              {railButton("All templates", ALL)}

              <p className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">By goal</p>
              <div className="space-y-0.5">{goals.map((goal) => railButton(goal, { kind: "goal", value: goal }))}</div>

              <p className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">By trigger</p>
              <div className="space-y-0.5">{triggers.map((t) => railButton(t, { kind: "trigger", value: t }))}</div>
            </aside>

            <div className="min-h-0 overflow-y-auto px-5 py-5">
              {visible.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-1 py-16 text-center">
                  <p className="text-sm font-medium">No templates match that</p>
                  <p className="text-[13px] text-muted-foreground">Try a different word, or clear the filter.</p>
                </div>
              ) : (
                <>
                  {recommended.length > 0 ? (
                    <section className="mb-8">
                      <h3 className="mb-3 text-[15px] font-semibold">Recommended</h3>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {recommended.map((t) => (
                          <TemplateCard
                            key={t.id}
                            template={t}
                            pending={pending === t.id}
                            disabled={busy}
                            onChoose={() => choose(t.id)}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {rest.length > 0 ? (
                    <section>
                      {recommended.length > 0 ? <h3 className="mb-3 text-[15px] font-semibold">Discover more templates</h3> : null}
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {rest.map((t) => (
                          <TemplateCard
                            key={t.id}
                            template={t}
                            pending={pending === t.id}
                            disabled={busy}
                            onChoose={() => choose(t.id)}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}
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
            <DialogDescription>
              {picked ? `"${picked.name}" will reply from this account.` : "The new automation will reply from this account."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="template-channel">Account</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger id="template-channel">
                <SelectValue placeholder="Pick an account" />
              </SelectTrigger>
              <SelectContent>
                {matchingChannels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.username ? `@${c.username}` : (c.name ?? "Unnamed")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="mt-2 gap-2 sm:gap-0">
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
