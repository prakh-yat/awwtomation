import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { PlatformMark } from "@/components/ui/platform-badge";

import { ContactAvatar } from "./contact-avatar";
import { riseStyle } from "./rise";

export type HeroFigure = { label: string; value: React.ReactNode };

/**
 * The top of a contact's page and its one colour block: who they are, where
 * they came from, who owns them, then the numbers that sum them up. Actions
 * and the owner picker are client components passed in as slots.
 */
export function ContactHero({
  displayName,
  name,
  username,
  handle,
  avatarUrl,
  platform,
  account,
  source,
  optedOut,
  owner,
  segments,
  actions,
  figures,
}: {
  displayName: string;
  name: string | null;
  /** Without the @; the avatar's initials fall back to it. */
  username: string | null;
  /** The username again, only when a real name is shown above it. */
  handle: string | null;
  avatarUrl: string | null;
  platform: "INSTAGRAM" | "FACEBOOK";
  /** The connected account they reached, e.g. "@yourbrand". */
  account: string;
  /** How they were added, when it was not a comment or message. */
  source: string | null;
  optedOut: boolean;
  owner: React.ReactNode;
  segments: React.ReactNode;
  actions: React.ReactNode;
  figures: HeroFigure[];
}) {
  return (
    <section aria-label={displayName} className="relative mb-6 overflow-hidden rounded-3xl bg-green-soft">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 [--grid-size:36px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]" />

      <div className="relative flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4 sm:gap-5">
          <ContactAvatar name={name} username={username} avatarUrl={avatarUrl} platform={platform} size="lg" className="rounded-full ring-4 ring-paper" />
          <div className="min-w-0 pt-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 className="font-display min-w-0 break-words text-[28px] leading-[1.05] sm:text-[34px]">{displayName}</h2>
              {optedOut ? <Badge variant="warning">Messages stopped</Badge> : null}
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink/70">
              {handle ? <span className="font-semibold text-ink">@{handle}</span> : null}
              {handle ? <span aria-hidden>·</span> : null}
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <PlatformMark platform={platform} size={18} />
                <span className="truncate">{account}</span>
              </span>
              {source ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{source}</span>
                </>
              ) : null}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
              <div className="flex items-center gap-2">
                <span className="brand-label text-ink/60">Owner</span>
                {owner}
              </div>
              {segments ? (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="brand-label text-ink/60">Segments</span>
                  {segments}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      <dl className="relative grid grid-cols-2 border-t border-ink/10 sm:grid-cols-3 lg:grid-cols-6">
        {figures.map((f, i) => (
          <div key={f.label} className="rise min-w-0 px-5 py-4 sm:px-7" style={riseStyle(i)}>
            <dt className="brand-label text-ink/60">{f.label}</dt>
            <dd className="font-display mt-2 break-words text-[20px] leading-tight tabular-nums sm:text-[22px]">{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
