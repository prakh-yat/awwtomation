"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, HelpCircle, MessageSquare, PenLine, Sparkles, Tag, Timer, UserCheck, Zap } from "lucide-react";

import { apiFetch, errorMessage } from "@/components/automations/api";
import { TriggerBadge } from "@/components/automations/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import type { FlowNodeType } from "@/lib/automation/flow-types";
import type { AutomationDetail, ChannelOption } from "@/lib/services/automations";
import type { TemplateStep, TemplateSummary } from "@/lib/services/templates";
import { cn } from "@/lib/utils";

const STEP_ICONS: Record<FlowNodeType, typeof Zap> = {
  trigger: Zap,
  send_message: MessageSquare,
  ask_question: HelpCircle,
  condition_follow: UserCheck,
  delay: Timer,
  add_tag: Tag,
  remove_tag: Tag,
};

function StepChain({ steps }: { steps: TemplateStep[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
      {steps.map((s, i) => {
        const Icon = STEP_ICONS[s.type];
        return (
          <li key={i} className="flex items-center gap-1">
            <span className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-foreground">
              <Icon className="h-3 w-3" strokeWidth={1.75} />
              {s.label}
            </span>
            {i < steps.length - 1 ? <ArrowRight className="h-3 w-3" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

const SCRATCH = "__scratch__";

export function TemplateGallery({ templates, channels }: { templates: TemplateSummary[]; channels: ChannelOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = React.useState<string | null>(null);
  // When several channels are active we ask which one; with one we just go.
  const [pickFor, setPickFor] = React.useState<string | null>(null);
  const [channelId, setChannelId] = React.useState(channels[0]?.id ?? "");
  const autoStarted = React.useRef(false);

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
    if (channels.length === 1) void create(templateId, channels[0].id);
    else setPickFor(templateId);
  }

  React.useEffect(() => {
    // /automations/new?template=<id> (from the list page's empty state) skips the browse step.
    const wanted = searchParams.get("template");
    if (!wanted || autoStarted.current || channels.length === 0) return;
    if (!templates.some((t) => t.id === wanted)) return;
    autoStarted.current = true;
    choose(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const pickedTemplate = pickFor && pickFor !== SCRATCH ? templates.find((t) => t.id === pickFor) : null;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={pending !== null}
            onClick={() => choose(t.id)}
            className={cn(
              "group flex h-full flex-col rounded-lg border bg-card p-5 text-left shadow-card transition-colors",
              "hover:border-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:pointer-events-none disabled:opacity-60",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t.name}</p>
                <p className="mt-1 text-[13px] text-muted-foreground">{t.description}</p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {t.category}
              </Badge>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <TriggerBadge trigger={t.triggerType} />
              {t.followGate ? (
                <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                  <UserCheck className="h-3 w-3" /> Follow gate
                </Badge>
              ) : null}
              {t.publicReplyEnabled ? (
                <Badge variant="outline" className="font-normal text-muted-foreground">
                  Public reply
                </Badge>
              ) : null}
            </div>
            <div className="mt-4 border-t pt-3">
              <StepChain steps={t.steps} />
            </div>
            <div className="mt-4 flex items-center justify-between text-[12px]">
              <span className="text-muted-foreground">
                {t.matchMode === "ANY" ? "Fires on every comment" : `Keywords: ${t.keywords.join(", ")}`}
              </span>
              <span className="inline-flex items-center gap-1 font-medium">
                {pending === t.id ? "Creating…" : "Use template"}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </button>
        ))}

        <button
          type="button"
          disabled={pending !== null}
          onClick={() => choose(SCRATCH)}
          className={cn(
            "group flex h-full min-h-[180px] flex-col items-center justify-center rounded-lg border border-dashed p-5 text-center transition-colors",
            "hover:border-foreground/50 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:pointer-events-none disabled:opacity-60",
          )}
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border bg-background shadow-card">
            <PenLine className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <p className="text-sm font-medium">{pending === SCRATCH ? "Creating…" : "Start from scratch"}</p>
          <p className="mt-1 max-w-[220px] text-[13px] text-muted-foreground">
            A comment trigger and one message with a link button. Shape it however you like.
          </p>
        </button>
      </div>

      <Dialog open={pickFor !== null} onOpenChange={(open) => !open && pending === null && setPickFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Which account?</DialogTitle>
            <DialogDescription>
              {pickedTemplate ? `“${pickedTemplate.name}” will listen on this account.` : "The new automation will listen on this account."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="template-channel">Channel</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger id="template-channel">
                <SelectValue placeholder="Pick a channel" />
              </SelectTrigger>
              <SelectContent>
                {channels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.username ? `@${c.username}` : (c.name ?? "Unnamed")} · {c.platform === "INSTAGRAM" ? "Instagram" : "Facebook"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="mt-2 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPickFor(null)} disabled={pending !== null}>
              Cancel
            </Button>
            <Button
              onClick={() => pickFor && channelId && create(pickFor, channelId)}
              disabled={!channelId}
              loading={pending !== null}
            >
              <Sparkles /> Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
