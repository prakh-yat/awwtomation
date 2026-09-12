"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronRight, X } from "lucide-react";

import { PlatformIcon } from "@/components/ui/platform-icon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AdminWebhookEventRow } from "@/lib/services/admin";
import { cn } from "@/lib/utils";

import { humanize } from "./constants";
import { prettyJson, truncateText } from "./format";
import { TimeAgo } from "./time-ago";

/** Read-only receipt list; rows expand to show the raw Meta payload for debugging. */
export function WebhookEventsTable({ items }: { items: AdminWebhookEventRow[] }) {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-8" />
          <TableHead>Platform</TableHead>
          <TableHead>Field</TableHead>
          <TableHead>Dedupe key</TableHead>
          <TableHead>Processed</TableHead>
          <TableHead>Error</TableHead>
          <TableHead>Received</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((event) => {
          const open = expanded === event.id;
          return (
            <React.Fragment key={event.id}>
              <TableRow className={cn("cursor-pointer", open && "bg-muted/40")} onClick={() => setExpanded(open ? null : event.id)}>
                <TableCell className="pr-0">
                  <span className="text-muted-foreground" aria-hidden>
                    {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    <PlatformIcon platform={event.platform} size={14} />
                    {humanize(event.platform)}
                  </span>
                </TableCell>
                <TableCell>
                  {event.field ? <span className="font-mono text-xs">{event.field}</span> : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs" title={event.dedupeKey}>
                    {truncateText(event.dedupeKey, 36)}
                  </span>
                </TableCell>
                <TableCell>
                  {event.processed ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <Check className="h-3.5 w-3.5" />
                      <span className="text-xs">Yes</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <X className="h-3.5 w-3.5" />
                      <span className="text-xs">No</span>
                    </span>
                  )}
                </TableCell>
                <TableCell className="max-w-[260px]">
                  {event.error ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block cursor-help truncate font-mono text-xs text-destructive">{truncateText(event.error, 48)}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-md whitespace-pre-wrap break-words font-mono text-[11px]">
                        {event.error}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <TimeAgo iso={event.createdAt} />
                </TableCell>
              </TableRow>
              {open ? (
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell colSpan={7} className="py-3">
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Payload</p>
                    <pre className="max-h-96 overflow-auto rounded-md border bg-background p-3 font-mono text-[11px] leading-relaxed">
                      {prettyJson(event.payload)}
                    </pre>
                    {event.error ? (
                      <>
                        <p className="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Error</p>
                        <pre className="overflow-auto rounded-md border bg-background p-3 font-mono text-[11px] leading-relaxed text-destructive">{event.error}</pre>
                      </>
                    ) : null}
                  </TableCell>
                </TableRow>
              ) : null}
            </React.Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
