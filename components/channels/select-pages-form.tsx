"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  // A workspace connects one Page: the one already here, else the first that is free.
  const [selectedId, setSelectedId] = React.useState<string | null>(
    () => (pages.find((p) => p.state === "connected") ?? pages.find((p) => p.state === "available"))?.id ?? null,
  );

  const selected = pages.find((p) => p.id === selectedId) ?? null;
  const needsSlot = selected?.state === "available";
  const overLimit = needsSlot && remainingSlots < 1;
  const left = remainingSlots - (needsSlot ? 1 : 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || overLimit) return;
    setSubmitting(true);
    try {
      const { channels } = await apiFetch<{ channels: ChannelView[] }>("/api/channels/facebook/select", {
        method: "POST",
        body: JSON.stringify({ pageIds: [selected.id] }),
      });
      // The dashboard turns `?connected=` into the success toast.
      router.push(`/dashboard?connected=${channels.map((c) => c.id).join(",")}`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't connect that Page"));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-card">
      <ul className="divide-y overflow-hidden rounded-t-2xl">
        {pages.map((page, i) => {
          const checked = page.id === selectedId;
          const blocked = page.state === "claimed" || page.state === "taken";
          const id = `page-${page.id}`;
          return (
            <li key={page.id} className="rise" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
              <label
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-center gap-3.5 px-4 py-3.5 transition-colors duration-150 sm:px-5",
                  blocked ? "cursor-not-allowed opacity-60" : checked ? "bg-yellow-soft/60" : "hover:bg-fog/70",
                )}
              >
                <input
                  id={id}
                  type="radio"
                  name="page"
                  value={page.id}
                  checked={checked}
                  disabled={blocked}
                  onChange={() => setSelectedId(page.id)}
                  className="h-4 w-4 shrink-0 accent-ink"
                />
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
                ) : page.state === "claimed" ? (
                  <Badge variant="outline">In another workspace</Badge>
                ) : page.state === "taken" ? (
                  <Badge variant="outline">Workspace has a Page</Badge>
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
              Your plan allows {planLimit} account{planLimit === 1 ? "" : "s"}. Disconnect one or{" "}
              <Link href="/settings/billing" className="font-semibold underline underline-offset-4 hover:no-underline">
                upgrade
              </Link>
              .
            </>
          ) : (
            `${left} account${left === 1 ? "" : "s"} left on your plan`
          )}
        </p>
        <Button type="submit" variant="highlight" size="lg" loading={submitting} disabled={!selected || overLimit}>
          Connect Page
        </Button>
      </div>
    </form>
  );
}
