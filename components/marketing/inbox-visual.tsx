import * as React from "react";
import { ChevronDown, Clock, ExternalLink, Search } from "lucide-react";

import { PlatformBadge } from "@/components/ui/platform-badge";
import type { PlatformIconPlatform } from "@/components/ui/platform-icon";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

import { Avatar, Chip, Panel } from "./mock-parts";

type Thread = {
  name: string;
  initials: string;
  platform: PlatformIconPlatform;
  time: string;
  preview: string;
  active?: boolean;
  unread?: boolean;
};

const threads: Thread[] = [
  { name: "Sita Rai", initials: "SR", platform: "INSTAGRAM", time: "2m", preview: "Yes please. Can I pay with eSewa?", active: true },
  { name: "Prabin Shrestha", initials: "PS", platform: "FACEBOOK", time: "18m", preview: "How much is delivery to Pokhara?", unread: true },
  { name: "Anisha Gurung", initials: "AG", platform: "INSTAGRAM", time: "25m", preview: "You: Yes, the same design comes in S." },
  { name: "Nisha Karki", initials: "NK", platform: "INSTAGRAM", time: "1h", preview: "You: It’s Rs. 150 and takes 2 to 3 days." },
  { name: "Rohan Tamang", initials: "RT", platform: "INSTAGRAM", time: "2h", preview: "Got it, thank you." },
  { name: "Kabita Chaudhary", initials: "KC", platform: "FACEBOOK", time: "3h", preview: "You: I’ve emailed you the wholesale prices." },
];

function ThreadList() {
  return (
    <div className="hidden min-w-0 flex-col border-r lg:flex">
      <div className="border-b px-4 pb-3 pt-3.5">
        <div className="flex items-baseline justify-between">
          <p className="text-[14px] font-semibold">Inbox</p>
          <p className="text-[11px] text-muted-foreground">12 open, 3 unread</p>
        </div>
        <div className="mt-3 flex h-8 items-center gap-2 rounded-full bg-fog px-3 text-[12px] text-muted-foreground">
          <Search aria-hidden className="size-3.5" strokeWidth={2} />
          Search by name or message
        </div>
        <div className="mt-2.5 flex gap-1.5 text-[11px] font-semibold">
          <span className="rounded-full bg-ink px-2.5 leading-5 text-white">All</span>
          <span className="rounded-full bg-fog px-2.5 leading-5 text-ink/70">Unread 3</span>
          <span className="rounded-full bg-fog px-2.5 leading-5 text-ink/70">Mine</span>
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-hidden">
        {threads.map((t) => (
          <li key={t.name} className={cn("flex gap-3 border-b px-4 py-3", t.active ? "bg-fog" : "bg-background")}>
            <Avatar initials={t.initials} size={32} platform={t.platform} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={cn("truncate text-[13px]", t.unread ? "font-semibold" : "font-medium")}>{t.name}</p>
                <p className="shrink-0 text-[11px] text-muted-foreground">{t.time}</p>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <p className={cn("truncate text-[12px]", t.unread ? "text-ink" : "text-muted-foreground")}>{t.preview}</p>
                {t.unread ? <span aria-hidden className="ml-auto size-2 shrink-0 rounded-full bg-magenta" /> : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Outgoing({ children, meta, button }: { children: React.ReactNode; meta: string; button?: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[82%] overflow-hidden rounded-[18px] rounded-br-md bg-ink text-white">
        <p className="px-3.5 py-2.5 text-[13px] leading-[1.45]">{children}</p>
        {button ? (
          <p className="flex items-center justify-center gap-1.5 border-t border-white/15 px-3 py-2 text-[12px] font-semibold">
            {button}
            <ExternalLink aria-hidden className="size-3" strokeWidth={2.25} />
          </p>
        ) : null}
      </div>
      <p className="px-1 text-[11px] text-muted-foreground">{meta}</p>
    </div>
  );
}

function Incoming({ children, meta }: { children: React.ReactNode; meta: string }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <p className="max-w-[82%] rounded-[18px] rounded-bl-md bg-fog px-3.5 py-2.5 text-[13px] leading-[1.45]">{children}</p>
      <p className="px-1 text-[11px] text-muted-foreground">{meta}</p>
    </div>
  );
}

function Conversation() {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 sm:px-5">
        <Avatar initials="SR" size={32} />
        <div className="min-w-0 leading-tight">
          <p className="text-[13px] font-semibold">Sita Rai</p>
          <p className="text-[11px] text-muted-foreground">@sita.rai</p>
        </div>
        <PlatformBadge platform="INSTAGRAM" className="hidden sm:inline-flex" />
        <span className="inline-flex items-center gap-1 rounded-full bg-fog px-2 text-[11px] font-semibold leading-5">
          <Clock aria-hidden className="size-3" strokeWidth={2.25} />
          23h left to reply
        </span>
        <span className="ml-auto hidden h-8 items-center gap-2 rounded-full border px-2.5 text-[12px] font-medium xl:inline-flex">
          <Avatar initials="BT" size={18} />
          Bikash Thapa
          <ChevronDown aria-hidden className="size-3.5 text-muted-foreground" strokeWidth={2} />
        </span>
      </div>

      <div className="flex-1 space-y-3.5 px-4 py-5 sm:px-5">
        <p className="text-center text-[11px] text-muted-foreground">Sita commented “link” on your reel, 4:12 PM</p>
        <Outgoing meta="Automated, 4:12 PM" button="Shop the collection">
          Namaste Sita, here’s the autumn collection. Delivery is free inside the valley this month.
        </Outgoing>
        <Incoming meta="4:31 PM">Do you have the rust kurta in M?</Incoming>
        <Outgoing meta="Bikash Thapa, 4:34 PM">Yes, M is in stock. Shall we keep one aside for you?</Outgoing>
        <Incoming meta="4:36 PM">Yes please. Can I pay with eSewa?</Incoming>
      </div>

      <div className="border-t px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3 rounded-full border py-1.5 pl-4 pr-1.5">
          <p className="text-[12px] text-muted-foreground">Reply to Sita…</p>
          <span className="inline-flex h-7 items-center rounded-full bg-ink px-3.5 text-[12px] font-semibold text-white">Send</span>
        </div>
      </div>
    </div>
  );
}

function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <p className="pt-px text-[12px] text-muted-foreground">{label}</p>
      <div className="min-w-0 text-right text-[12px] font-semibold">{children}</div>
    </div>
  );
}

function ContactDetails() {
  return (
    <div className="border-t md:border-l md:border-t-0">
      <div className="flex items-center gap-3 border-b px-4 py-3.5 md:flex-col md:items-center md:gap-2 md:py-5 md:text-center">
        <Avatar initials="SR" size={40} />
        <div className="leading-tight">
          <p className="text-[13px] font-semibold">Sita Rai</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">@sita.rai, follows you</p>
        </div>
      </div>
      <div className="divide-y px-4 py-1.5">
        <Property label="Stage">
          <span className="inline-flex items-center gap-1">
            Lead <ChevronDown aria-hidden className="size-3 text-muted-foreground" strokeWidth={2} />
          </span>
        </Property>
        <Property label="Owner">Bikash Thapa</Property>
        <Property label="Tags">
          <span className="flex flex-wrap justify-end gap-1">
            <Chip>autumn-collection</Chip>
            <Chip>kurta</Chip>
          </span>
        </Property>
        <Property label="City">Lalitpur</Property>
      </div>
      <div className="px-4 pb-4 pt-2">
        <p className="text-[12px] font-semibold">Notes</p>
        <div className="mt-2 rounded-xl bg-yellow-soft px-3 py-2.5">
          <p className="text-[12px] leading-[1.5]">Keeping the rust kurta in M for her. Paying with eSewa on delivery.</p>
          <p className="mt-1.5 text-[11px] text-ink/60">Bikash Thapa, 4:38 PM</p>
        </div>
      </div>
    </div>
  );
}

/** The shared inbox with Sita's conversation open and her contact details beside it. */
function InboxVisual({ className }: { className?: string }) {
  return (
    <Panel
      role="img"
      aria-label={`The ${brand.name} inbox. Sita Rai’s conversation is open: the automated DM, her question about the rust kurta, Bikash Thapa’s reply, and her contact details with stage Lead, owner Bikash Thapa, tags and a note.`}
      className={cn(
        "grid md:grid-cols-[minmax(0,1fr)_260px] lg:grid-cols-[290px_minmax(0,1fr)_280px] xl:h-[560px]",
        className,
      )}
    >
      <ThreadList />
      <Conversation />
      <ContactDetails />
    </Panel>
  );
}

export { InboxVisual };
