import * as React from "react";
import { ExternalLink, MessageSquare, Tag, Zap, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { TONES, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

import { Avatar, Chip, Panel } from "./mock-parts";

function FlowStep({
  icon: Icon,
  title,
  tone,
  children,
}: {
  icon: LucideIcon;
  title: string;
  /** The step's colour in the builder: trigger yellow, send message purple, tags green. */
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-background shadow-[0_1px_2px_rgb(15_15_15/0.05)]">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className={cn("flex size-5 items-center justify-center rounded-md", TONES[tone].solid)}>
          <Icon aria-hidden className="size-3" strokeWidth={2.25} />
        </span>
        <p className="text-[12px] font-semibold">{title}</p>
      </div>
      <div className="px-3 py-2.5 text-[12px] leading-[1.5] text-muted-foreground">{children}</div>
    </div>
  );
}

function Connector() {
  return (
    <div aria-hidden className="flex justify-center">
      <span className="h-5 w-px bg-ink/35" />
    </div>
  );
}

/** The automation as it looks in the builder: trigger, message, tag. */
function AutomationPanel({ className }: { className?: string }) {
  return (
    <Panel className={cn("flex flex-col", className)}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">Autumn collection link</p>
          <p className="text-[11px] text-muted-foreground">@himalayanthreads, 2 posts</p>
        </div>
        <Badge variant="success" dot="pulse" className="shrink-0">
          Active
        </Badge>
      </div>
      <div className="bg-dots flex-1 bg-fog/60 px-4 py-5">
        <FlowStep icon={Zap} title="Comment trigger" tone="yellow">
          <p>Comment contains</p>
          <p className="mt-1.5 flex flex-wrap gap-1">
            <Chip>link</Chip>
            <Chip>shop</Chip>
          </p>
          <p className="mt-2">Public reply: 3 variations</p>
        </FlowStep>
        <Connector />
        <FlowStep icon={MessageSquare} title="Send message" tone="purple">
          <p className="text-ink">
            Namaste {"{{first_name}}"}, here’s the autumn collection. Delivery is free inside the valley this month.
          </p>
          <p className="-mx-3 mt-2.5 flex items-center gap-1.5 border-t px-3 pt-2 font-semibold text-ink">
            <ExternalLink aria-hidden className="size-3" strokeWidth={2.25} />
            Shop the collection
          </p>
        </FlowStep>
        <Connector />
        <FlowStep icon={Tag} title="Add tag" tone="green">
          <Chip>autumn-collection</Chip>
        </FlowStep>
      </div>
    </Panel>
  );
}

const activity: Array<{ time: string; body: React.ReactNode }> = [
  { time: "4:12 PM", body: <>Commented “link” on the autumn collection reel</> },
  {
    time: "4:12 PM",
    body: (
      <>
        Got a DM from <span className="font-semibold text-ink">Autumn collection link</span>
      </>
    ),
  },
  { time: "4:12 PM", body: <>Public reply posted: “Sent it to your DMs, Sita.”</> },
  {
    time: "4:12 PM",
    body: (
      <>
        Tagged <Chip className="align-[1px]">autumn-collection</Chip>
      </>
    ),
  },
  {
    time: "4:14 PM",
    body: (
      <>
        Opened <span className="font-semibold text-ink">Shop the collection</span>
      </>
    ),
  },
  { time: "4:31 PM", body: <>Replied: “Do you have the rust kurta in M?”</> },
  {
    time: "4:36 PM",
    body: (
      <>
        <span className="font-semibold text-ink">Bikash Thapa</span> moved her from New to Lead
      </>
    ),
  },
];

/** The contact record the automation created for Sita, with its activity log. */
function ActivityPanel({ className }: { className?: string }) {
  return (
    <Panel className={cn("flex flex-col", className)}>
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Avatar initials="SR" size={32} platform="INSTAGRAM" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-semibold">Sita Rai</p>
          <p className="truncate text-[11px] text-muted-foreground">@sita.rai</p>
        </div>
        <div className="text-right leading-tight">
          <p className="text-[11px] text-muted-foreground">Stage</p>
          <p className="text-[12px] font-semibold">Lead</p>
        </div>
      </div>
      <div className="px-4 pb-5 pt-3.5">
        <p className="text-[12px] font-semibold">Notes and activity</p>
        <ol className="relative mt-3.5 space-y-3.5 before:absolute before:bottom-1.5 before:left-[3px] before:top-1.5 before:w-px before:bg-border">
          {activity.map((item, i) => (
            <li key={i} className="relative flex gap-3 pl-5">
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 top-[5px] size-[7px] rounded-full ring-2 ring-background",
                  i === 0 ? "bg-ink" : "bg-ink/30",
                )}
              />
              <p className="min-w-0 flex-1 text-[12px] leading-[1.5] text-muted-foreground">{item.body}</p>
              <p className="shrink-0 text-[11px] leading-[18px] tabular-nums text-muted-foreground">{item.time}</p>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}

/** Walkthrough picture: the automation next to what it did for one person. */
function FlowVisual({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="The Autumn collection link automation: a comment trigger for the words link and shop, a message with a Shop the collection button, and a tag. Next to it, Sita Rai’s contact record lists each step with its time."
      className={cn("grid items-start gap-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] sm:gap-5", className)}
    >
      <AutomationPanel />
      <ActivityPanel />
    </div>
  );
}

export { FlowVisual };
