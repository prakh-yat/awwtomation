"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
      // The channels page turns `?connected=` into the success toast.
      router.push(`/channels?connected=${channels.map((c) => c.id).join(",")}`);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't connect the selected Pages"));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border bg-card shadow-card">
      <ul className="divide-y">
        {pages.map((page) => {
          const checked = selected.has(page.id);
          const claimed = page.state === "claimed";
          const id = `page-${page.id}`;
          return (
            <li key={page.id}>
              <label
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40",
                  claimed && "cursor-not-allowed opacity-60 hover:bg-transparent",
                )}
              >
                <Checkbox id={id} checked={checked} disabled={claimed} onCheckedChange={() => toggle(page)} aria-label={`Select ${page.name}`} />
                <Avatar className="h-9 w-9 border">
                  {page.picture ? <AvatarImage src={page.picture} alt="" referrerPolicy="no-referrer" /> : null}
                  <AvatarFallback>{initials(page.name, "P")}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{page.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <PlatformIcon platform="FACEBOOK" size={11} />
                    <span>Facebook Page</span>
                    {page.instagramBusinessId ? (
                      <>
                        <span aria-hidden>·</span>
                        <PlatformIcon platform="INSTAGRAM" size={11} />
                        <span>Instagram linked</span>
                      </>
                    ) : null}
                  </p>
                </div>
                {page.state === "connected" ? (
                  <Badge variant="success">
                    <Check className="h-3 w-3" />
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

      <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className={cn("text-[13px]", overLimit ? "text-destructive" : "text-muted-foreground")}>
          {overLimit
            ? `Your plan allows ${planLimit} connected account${planLimit === 1 ? "" : "s"}. Deselect ${newCount - remainingSlots} or upgrade.`
            : `${newCount} new · ${remainingSlots - newCount} slot${remainingSlots - newCount === 1 ? "" : "s"} left on your plan`}
        </p>
        <Button type="submit" loading={submitting} disabled={count === 0 || overLimit}>
          Connect {count} {count === 1 ? "Page" : "Pages"}
        </Button>
      </div>
    </form>
  );
}
