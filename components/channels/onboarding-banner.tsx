import type { ChannelPlatform } from "@prisma/client";
import { ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/ui/platform-icon";

import { connectHref } from "./channel-status";
import type { MetaConfigured } from "./connect-buttons";

type Option = {
  platform: ChannelPlatform;
  title: string;
  description: string;
  points: string[];
  cta: string;
};

const OPTIONS: Option[] = [
  {
    platform: "INSTAGRAM",
    title: "Instagram professional account",
    description: "Business or Creator account. Signs in with Instagram directly — no Facebook Page required.",
    points: ["Comment → DM on posts and reels", "DM and story-reply keyword triggers", "Follow-to-unlock gates"],
    cta: "Connect Instagram",
  },
  {
    platform: "FACEBOOK",
    title: "Facebook Page",
    description: "Any Page you manage. Pick one or several after signing in with Facebook.",
    points: ["Comment → Messenger reply on Page posts", "Messenger keyword triggers", "Public replies under comments"],
    cta: "Connect Facebook Page",
  },
];

/** Step 2 of onboarding (`/channels?onboarding=1`): two large choices, nothing else competing for attention. */
export function OnboardingBanner({ configured }: { configured: MetaConfigured }) {
  return (
    <section aria-labelledby="onboarding-title" className="mb-6 rounded-lg border bg-card p-6 shadow-card">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Step 2 of 2</p>
      <h2 id="onboarding-title" className="mt-1 text-base font-semibold tracking-tight">
        Connect your first account to start automating
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        You&apos;ll be sent to Meta to approve access, then land back here. Tokens are encrypted at rest and you can
        disconnect at any time.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const enabled = option.platform === "INSTAGRAM" ? configured.instagram : configured.facebook;
          return (
            <div key={option.platform} className="flex flex-col rounded-lg border bg-background p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-md border bg-card shadow-card">
                  <PlatformIcon platform={option.platform} size={18} />
                </span>
                <h3 className="text-sm font-medium">{option.title}</h3>
              </div>
              <p className="mt-3 text-[13px] text-muted-foreground">{option.description}</p>
              <ul className="mt-3 space-y-1.5 text-[13px]">
                {option.points.map((point) => (
                  <li key={point} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 pt-1">
                {enabled ? (
                  <Button asChild className="w-full" variant={option.platform === "INSTAGRAM" ? "default" : "outline"}>
                    <a href={connectHref(option.platform)}>
                      {option.cta}
                      <ArrowRight />
                    </a>
                  </Button>
                ) : (
                  <Button className="w-full" variant="outline" disabled>
                    {option.cta} · not configured
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
