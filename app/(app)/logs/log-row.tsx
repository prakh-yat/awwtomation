"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DeliveryLogItem } from "@/lib/services/logs";
import { cn, truncate } from "@/lib/utils";

import { formatLogTime, formatLogTimeLong, recipientHandle } from "./format";
import { KIND_LABELS, STATUS_LABELS, STATUS_SHORT_LABELS, statusVariant } from "./labels";

const PREVIEW_MAX = 60;
const ERROR_MAX = 48;

export interface LogRowProps {
  item: DeliveryLogItem;
  timezone: string;
  expanded: boolean;
  onToggle: (id: string) => void;
}

function SourceCell({ item }: { item: DeliveryLogItem }) {
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
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-[13px]">{children}</dd>
    </div>
  );
}

/**
 * Two physical rows: the summary line, and (when expanded) a detail panel
 * spanning every column. Keeping them as siblings preserves the table's
 * hairline borders without nesting tables.
 */
export function LogRow({ item, timezone, expanded, onToggle }: LogRowProps) {
  const recipient = recipientHandle(item.recipientUsername, item.contact?.name, item.recipientExternalId);
  const channelLabel = item.channel.username ? `@${item.channel.username}` : (item.channel.name ?? item.channel.id);
  const metaJson = item.metaResponse === null ? null : JSON.stringify(item.metaResponse, null, 2);

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
        </TableCell>
        <TableCell>
          <Badge variant="outline">{KIND_LABELS[item.kind]}</Badge>
        </TableCell>
        <TableCell>
          <Badge variant={statusVariant(item.status)} title={STATUS_LABELS[item.status]}>
            {STATUS_SHORT_LABELS[item.status]}
          </Badge>
        </TableCell>
        <TableCell className="max-w-[180px]">
          <div className="flex items-center gap-1.5">
            <PlatformIcon platform={item.channel.platform} size={13} className="text-muted-foreground" />
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
        <TableCell className="max-w-[200px]">
          <div className="flex min-w-0">
            <SourceCell item={item} />
          </div>
        </TableCell>
        <TableCell className="max-w-[260px] text-muted-foreground">
          {item.messagePreview ? (
            <span className="block truncate" title={item.messagePreview}>
              {truncate(item.messagePreview, PREVIEW_MAX)}
            </span>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          )}
        </TableCell>
        <TableCell className="max-w-[220px]">
          {item.errorMessage ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn("block truncate", item.status === "FAILED" ? "text-destructive" : "text-muted-foreground")}>
                  {truncate(item.errorMessage, ERROR_MAX)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-sm whitespace-pre-wrap break-words">
                {item.errorMessage}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          )}
        </TableCell>
      </TableRow>

      {expanded ? (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={8} className="px-4 py-4">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Detail label="Time">{formatLogTimeLong(item.createdAt, timezone)}</Detail>
                <Detail label="Channel">
                  <span className="inline-flex items-center gap-1.5">
                    <PlatformIcon platform={item.channel.platform} size={13} className="text-muted-foreground" />
                    {channelLabel}
                  </span>
                </Detail>
                <Detail label="Recipient id">
                  <span className="font-mono text-xs">{item.recipientExternalId ?? "—"}</span>
                </Detail>
                <Detail label="Comment id">
                  <span className="font-mono text-xs">{item.commentExternalId ?? "—"}</span>
                </Detail>
                <Detail label="Message" className="col-span-2">
                  {item.messagePreview ? <span className="whitespace-pre-wrap">{item.messagePreview}</span> : "—"}
                </Detail>
                {item.errorMessage ? (
                  <Detail label="Error" className="col-span-2">
                    <span className={cn("whitespace-pre-wrap", item.status === "FAILED" && "text-destructive")}>{item.errorMessage}</span>
                  </Detail>
                ) : null}
                <Detail label="Log id" className="col-span-2">
                  <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
                </Detail>
              </dl>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Meta response</p>
                {metaJson ? (
                  <pre className="mt-1 max-h-64 overflow-auto rounded-md border bg-background p-3 font-mono text-xs leading-relaxed scrollbar-thin">
                    {metaJson}
                  </pre>
                ) : (
                  <p className="mt-1 text-[13px] text-muted-foreground">No response recorded — the message never reached Meta.</p>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
