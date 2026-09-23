"use client";

import Link from "next/link";
import { Megaphone, Workflow } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { TrackedLinkListItem } from "@/lib/services/links";
import { cn } from "@/lib/utils";

/**
 * Where a link came from, in that section's colour: automations purple,
 * broadcasts orange. A link made on this page is "Manual". Clicks and keys
 * stop here so a row that opens on click doesn't swallow the navigation.
 */
export function SourceBadge({ link, className }: { link: Pick<TrackedLinkListItem, "automation" | "broadcast">; className?: string }) {
  const source = link.automation
    ? { href: `/automations/${link.automation.id}`, name: link.automation.name, kind: "Automation", icon: Workflow, variant: "purple" as const }
    : link.broadcast
      ? { href: `/broadcasts/${link.broadcast.id}`, name: link.broadcast.name, kind: "Broadcast", icon: Megaphone, variant: "orange" as const }
      : null;

  if (!source) {
    return (
      <Badge variant="secondary" className={className}>
        Manual
      </Badge>
    );
  }

  const Icon = source.icon;
  return (
    <Link
      href={source.href}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      title={`${source.kind}: ${source.name}`}
      className={cn("inline-flex min-w-0 max-w-full rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <Badge variant={source.variant} className="min-w-0 max-w-full transition-opacity hover:opacity-80">
        <Icon aria-hidden />
        <span className="truncate">{source.name}</span>
      </Badge>
    </Link>
  );
}
