"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { TableCell, TableRow } from "@/components/ui/table";
import type { DeliveryLogItem } from "@/lib/services/logs";
import { cn, truncate } from "@/lib/utils";

import { formatLogTime, formatLogTimeLong, recipientHandle } from "./format";
import { KIND_LABELS, STATUS_LABELS, STATUS_SHORT_LABELS, statusVariant } from "./labels";

const PREVIEW_MAX = 80;

export interface LogRowProps {
  item: DeliveryLogItem;
  timezone: string;
  expanded: boolean;
  onToggle: (id: string) => void;
}

function SourceLink({ item }: { item: DeliveryLogItem }) {
  if (item.automation) {
    return (
      <Link
        href={`/automations/${item.automation.id}`}
        onClick={(e) => e.stopPropagation()}
        className="truncate underline-offset-2 hover:underline"
        title={item.automation.name}
      >
        {item.automation.name}
      </Link>
    );
  }
  if (item.broadcast) {
    return (
      <Link
        href={`/broadcasts/${item.broadcast.id}`}
        onClick={(e) => e.stopPropagation()}
        className="truncate underline-offset-2 hover:underline"
        title={item.broadcast.name}
      >
        {item.broadcast.name}
      </Link>
    );
  }
  return <span className="text-muted-foreground">Inbox</span>;
}

function Detail({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] text-foreground">{children}</dd>
    </div>
  );
}

/**
 * Summary row plus an optional detail row spanning every column. Everything
 * shown here is the customer's own activity in their own words: no internal
 * ids, raw platform errors or API payloads ever reach this component.
 */
export function LogRow({ item, timezone, expanded, onToggle }: LogRowProps) {
  const recipient = recipientHandle(item.recipientUsername, item.contact?.name);
  const channelLabel = item.channel.username ? `@${item.channel.username}` : (item.channel.name ?? "Channel");

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
        className={cn("cursor-pointer", expanded && "bg-muted/40")}
      >
        <TableCell className="w-8 pr-0 text-muted-foreground">
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} aria-hidden />
        </TableCell>
        <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground" title={formatLogTimeLong(item.createdAt, timezone)}>
          {formatLogTime(item.createdAt, timezone)}
          {/* Phones drop the recipient column, so the handle rides along under the time. */}
          <span className="mt-0.5 block max-w-[150px] truncate text-[12px] text-foreground sm:hidden">{recipient}</span>
        </TableCell>
        <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{KIND_LABELS[item.kind]}</TableCell>
        <TableCell>
          <Badge variant={statusVariant(item.status)} title={STATUS_LABELS[item.status]}>
            {STATUS_SHORT_LABELS[item.status]}
          </Badge>
          {item.status === "FAILED" && item.reason ? (
            <span className="mt-1 block max-w-[160px] truncate text-[11px] text-muted-foreground" title={item.reason}>
              {item.reason}
            </span>
          ) : null}
        </TableCell>
        <TableCell className="hidden max-w-[180px] sm:table-cell">
          <div className="flex items-center gap-1.5">
            <PlatformIcon platform={item.channel.platform} size={13} className="shrink-0 text-muted-foreground" />
            {item.contact ? (
              <Link
                href={`/contacts/${item.contact.id}`}
                onClick={(e) => e.stopPropagation()}
                className="truncate font-medium underline-offset-2 hover:underline"
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
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={7} className="px-4 py-4">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="Time">{formatLogTimeLong(item.createdAt, timezone)}</Detail>
              <Detail label="Account">
                <span className="inline-flex items-center gap-1.5">
                  <PlatformIcon platform={item.channel.platform} size={13} className="text-muted-foreground" />
                  {channelLabel}
                </span>
              </Detail>
              <Detail label="Recipient">{recipient}</Detail>
              <Detail label="Sent by">
                <SourceLink item={item} />
              </Detail>
              <Detail label="Message" className="sm:col-span-2">
                {item.messagePreview ? <span className="whitespace-pre-wrap">{item.messagePreview}</span> : "–"}
              </Detail>
              {item.reasonDetail ? (
                <Detail label={item.status === "FAILED" ? "What went wrong" : "Why it wasn't sent"} className="sm:col-span-2">
                  <span className="text-muted-foreground">{item.reasonDetail}</span>
                </Detail>
              ) : null}
            </dl>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
