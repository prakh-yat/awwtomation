"use client";

import Link from "next/link";
import * as React from "react";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { PlatformMark } from "@/components/ui/platform-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import type { DeliveryLogItem } from "@/lib/services/logs";
import { cn, truncate } from "@/lib/utils";

import { formatLogTime, formatLogTimeLong, recipientHandle } from "./format";
import { failureReason, KIND_LABELS, STATUS_HELP, STATUS_LABELS, STATUS_SHORT_LABELS, statusVariant } from "./labels";

const PREVIEW_MAX = 80;

export interface LogRowProps {
  item: DeliveryLogItem;
  timezone: string;
  expanded: boolean;
  onToggle: (id: string) => void;
  /** Position in the list, for the entrance stagger. */
  index?: number;
}

/** Keeps a click or key on a link inside the row from also toggling it. */
function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function SourceLink({ item }: { item: DeliveryLogItem }) {
  const source = item.automation
    ? { href: `/automations/${item.automation.id}`, name: item.automation.name }
    : item.broadcast
      ? { href: `/broadcasts/${item.broadcast.id}`, name: item.broadcast.name }
      : null;
  if (!source) return <span className="text-muted-foreground">Inbox</span>;
  return (
    <Link href={source.href} onClick={stop} onKeyDown={stop} className="truncate underline-offset-2 hover:underline" title={source.name}>
      {source.name}
    </Link>
  );
}

function Detail({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="brand-label text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-[13px] text-foreground">{children}</dd>
    </div>
  );
}

/**
 * Summary row plus an optional detail row spanning every column. Everything
 * shown here is the customer's own activity in their own words: no internal
 * ids, raw platform errors or API payloads ever reach this component.
 */
export function LogRow({ item, timezone, expanded, onToggle, index = 0 }: LogRowProps) {
  const recipient = recipientHandle(item.recipientUsername, item.contact?.name);
  const channelLabel = item.channel.username ? `@${item.channel.username}` : (item.channel.name ?? "Channel");
  const failed = item.status === "FAILED";
  const failure = failed ? failureReason(item.reason) : null;
  // A skip is explained by its status alone; a failure carries its own plain explanation.
  const why = item.status === "SENT" ? null : failed ? (item.reasonDetail ?? STATUS_HELP.FAILED) : STATUS_HELP[item.status];

  return (
    <>
      <TableRow
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => onToggle(item.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(item.id);
          }
        }}
        className={cn(
          "rise cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          expanded && "border-b-0 bg-fog/70 hover:bg-fog/70",
        )}
        style={{ "--i": Math.min(index, 12) } as React.CSSProperties}
      >
        <TableCell className="w-8 pr-0 text-muted-foreground">
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200 ease-soft", expanded && "rotate-90")} aria-hidden />
        </TableCell>
        <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground" title={formatLogTimeLong(item.createdAt, timezone)}>
          {formatLogTime(item.createdAt, timezone)}
          {/* Phones drop the recipient column, so the handle rides along under the time. */}
          <span className="mt-1 flex max-w-[160px] items-center gap-1.5 text-[12px] text-foreground sm:hidden">
            <PlatformMark platform={item.channel.platform} size={14} />
            <span className="truncate">{recipient}</span>
          </span>
        </TableCell>
        <TableCell>
          <Badge variant={statusVariant(item.status)} title={STATUS_LABELS[item.status]}>
            {STATUS_SHORT_LABELS[item.status]}
          </Badge>
          {failure ? (
            <span className="mt-1 block max-w-[160px] truncate text-[11px] text-muted-foreground" title={failure}>
              {failure}
            </span>
          ) : null}
        </TableCell>
        <TableCell className="hidden max-w-[200px] sm:table-cell">
          <div className="flex min-w-0 items-center gap-2">
            <PlatformMark platform={item.channel.platform} size={18} />
            {item.contact ? (
              <Link
                href={`/contacts/${item.contact.id}`}
                onClick={stop}
                onKeyDown={stop}
                className="truncate font-semibold underline-offset-2 hover:underline"
                title={recipient}
              >
                {recipient}
              </Link>
            ) : (
              <span className="truncate" title={recipient}>
                {recipient}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{KIND_LABELS[item.kind]}</TableCell>
        <TableCell className="hidden max-w-[200px] lg:table-cell">
          <div className="flex min-w-0">
            <SourceLink item={item} />
          </div>
        </TableCell>
        <TableCell className="hidden max-w-[360px] text-muted-foreground xl:table-cell">
          {item.messagePreview ? (
            <span className="block truncate" title={item.messagePreview}>
              {truncate(item.messagePreview, PREVIEW_MAX)}
            </span>
          ) : (
            <span className="text-muted-foreground/50">–</span>
          )}
        </TableCell>
      </TableRow>

      {expanded ? (
        <TableRow className="bg-fog/70 hover:bg-fog/70">
          <TableCell colSpan={7} className="px-4 pb-5 pt-1 sm:px-6">
            <div className="animate-fade-in space-y-4">
              {why ? (
                <div className={cn("rounded-xl px-3.5 py-3", failed ? "bg-destructive/10" : "border bg-background")}>
                  <p className={cn("brand-label", failed ? "text-destructive" : "text-muted-foreground")}>
                    {failed ? "What went wrong" : "Why it wasn't sent"}
                  </p>
                  <p className="mt-1 text-[13px] text-foreground">{why}</p>
                </div>
              ) : null}
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="Time">{formatLogTimeLong(item.createdAt, timezone)}</Detail>
                <Detail label="Account">
                  <span className="inline-flex items-center gap-1.5">
                    <PlatformMark platform={item.channel.platform} size={16} />
                    {channelLabel}
                  </span>
                </Detail>
                <Detail label="Recipient">{recipient}</Detail>
                <Detail label="Sent by">
                  <SourceLink item={item} />
                </Detail>
                <Detail label="Type" className="md:hidden">
                  {KIND_LABELS[item.kind]}
                </Detail>
                <Detail label="Message" className="sm:col-span-2 lg:col-span-4">
                  {item.messagePreview ? <span className="whitespace-pre-wrap">{item.messagePreview}</span> : "–"}
                </Detail>
              </dl>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
