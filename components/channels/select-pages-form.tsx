"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PlatformMark } from "@/components/ui/platform-badge";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { toast } from "@/components/ui/sonner";
import type { ChannelView, SelectablePage } from "@/lib/services/channels";
import { cn, initials } from "@/lib/utils";

import { apiFetch, errorMessage } from "./api";

export interface SelectPagesFormProps {
  pages: SelectablePage[];
  /** Free channel slots on the plan; connected pages don't consume one. */
  remainingSlots: number;
  planLimit: number;
}

export function SelectPagesForm({ pages, remainingSlots, planLimit }: SelectPagesFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(() => {
    // Pre-select everything the plan can hold: already-connected pages (free) plus available ones up to the limit.
    const initial = new Set(pages.filter((p) => p.state === "connected").map((p) => p.id));
    let budget = remainingSlots;
    for (const page of pages) {
      if (page.state === "available" && budget > 0) {
        initial.add(page.id);
        budget--;
      }
    }
    return initial;
  });

  const newCount = pages.filter((p) => p.state === "available" && selected.has(p.id)).length;
  const overLimit = newCount > remainingSlots;
  const count = selected.size;
  const left = remainingSlots - newCount;

  function toggle(page: SelectablePage) {
    if (page.state === "claimed") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(page.id)) next.delete(page.id);
      else next.add(page.id);
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (count === 0 || overLimit) return;
    setSubmitting(true);
    try {
      const { channels } = await apiFetch<{ channels: ChannelView[] }>("/api/channels/facebook/select", {
        method: "POST",
        body: JSON.stringify({ pageIds: Array.from(selected) }),
      });
      // The dashboard turns `?connected=` into the success toast.
      router.push(`/dashboard?connected=${channels.map((c) => c.id).join(",")}`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't connect the selected Pages"));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-card">
      <ul className="divide-y overflow-hidden rounded-t-2xl">
        {pages.map((page, i) => {
          const checked = selected.has(page.id);
          const claimed = page.state === "claimed";
          const id = `page-${page.id}`;
          return (
            <li key={page.id} className="rise" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
              <label
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-center gap-3.5 px-4 py-3.5 transition-colors duration-150 sm:px-5",
                  claimed ? "cursor-not-allowed opacity-60" : checked ? "bg-yellow-soft/60" : "hover:bg-fog/70",
                )}
              >
                <Checkbox id={id} checked={checked} disabled={claimed} onCheckedChange={() => toggle(page)} aria-label={`Select ${page.name}`} />
                <div className="relative shrink-0">
                  <Avatar className="h-10 w-10 border">
                    {page.picture ? <AvatarImage src={page.picture} alt="" referrerPolicy="no-referrer" /> : null}
                    <AvatarFallback>{initials(page.name, "P")}</AvatarFallback>
                  </Avatar>
                  <PlatformMark aria-hidden platform="FACEBOOK" size={18} className="absolute -bottom-1 -right-1 ring-2 ring-card" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{page.name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                    <span>Facebook Page</span>
                    {page.instagramBusinessId ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-magenta-soft py-0.5 pl-1.5 pr-2 text-[11px] font-semibold text-magenta-ink">
                        <PlatformIcon platform="INSTAGRAM" size={11} />
                        Instagram linked
                      </span>
                    ) : null}
                  </p>
                </div>
                {page.state === "connected" ? (
                  <Badge variant="success">
                    <Check />
                    Connected
                  </Badge>
                ) : claimed ? (
                  <Badge variant="outline">In another workspace</Badge>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>

      {/* Sticks to the bottom of the window, so a long list never hides the button. */}
      <div className="sticky bottom-0 flex flex-col gap-3 rounded-b-2xl border-t bg-card/95 px-4 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className={cn("text-[13px]", overLimit ? "text-destructive" : "text-muted-foreground")}>
          {overLimit ? (
            <>
              Your plan allows {planLimit} account{planLimit === 1 ? "" : "s"}. Deselect {newCount - remainingSlots} or{" "}
              <Link href="/settings/billing" className="font-semibold underline underline-offset-4 hover:no-underline">
                upgrade
              </Link>
              .
            </>
          ) : (
            `${left} account${left === 1 ? "" : "s"} left on your plan`
          )}
        </p>
        <Button type="submit" variant="highlight" size="lg" loading={submitting} disabled={count === 0 || overLimit}>
          Connect {count} {count === 1 ? "Page" : "Pages"}
        </Button>
      </div>
    </form>
  );
}
