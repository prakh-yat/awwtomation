"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatNumber } from "@/lib/utils";

type PageToken = number | "gap-start" | "gap-end";

/** 1 … 4 5 6 … 20: first, last, and the pages around the current one. */
function pageTokens(page: number, pageCount: number): PageToken[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const start = Math.max(2, Math.min(page - 1, pageCount - 4));
  const end = Math.min(pageCount - 1, Math.max(page + 1, 5));
  const tokens: PageToken[] = [1];
  if (start > 2) tokens.push("gap-start");
  for (let p = start; p <= end; p++) tokens.push(p);
  if (end < pageCount - 1) tokens.push("gap-end");
  tokens.push(pageCount);
  return tokens;
}

export interface PaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  pageSizes?: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  /** Plural noun for the range label, e.g. "contacts". */
  noun?: string;
  disabled?: boolean;
  className?: string;
}

/** Numbered pages with previous and next, a range label and a rows-per-page picker. */
export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  pageSizes,
  onPageChange,
  onPageSizeChange,
  noun = "rows",
  disabled,
  className,
}: PaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <nav aria-label="Pages" className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px]", className)}>
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="tabular-nums">
          {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)} {noun}
        </span>
        {pageSizes && onPageSizeChange ? (
          <span className="hidden items-center gap-2 sm:flex">
            <span aria-hidden className="h-4 w-px bg-border" />
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))} disabled={disabled}>
              <SelectTrigger className="h-7 w-auto gap-1.5 border-transparent bg-transparent px-2 text-[13px] shadow-none hover:border-input" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizes.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} per page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </span>
        ) : null}
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => onPageChange(page - 1)} disabled={disabled || page <= 1} aria-label="Previous page">
            <ChevronLeft />
            <span className="hidden sm:inline">Previous</span>
          </Button>
          <span className="px-2 tabular-nums text-muted-foreground sm:hidden">
            {page} / {pageCount}
          </span>
          <ol className="hidden items-center gap-1 sm:flex">
            {pageTokens(page, pageCount).map((token) =>
              typeof token === "number" ? (
                <li key={token}>
                  <button
                    type="button"
                    onClick={() => onPageChange(token)}
                    disabled={disabled}
                    aria-current={token === page ? "page" : undefined}
                    aria-label={`Page ${token}`}
                    className={cn(
                      "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none",
                      token === page ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {token}
                  </button>
                </li>
              ) : (
                <li key={token} aria-hidden className="inline-flex h-8 w-6 items-center justify-center text-muted-foreground">
                  …
                </li>
              ),
            )}
          </ol>
          <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => onPageChange(page + 1)} disabled={disabled || page >= pageCount} aria-label="Next page">
            <span className="hidden sm:inline">Next</span>
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
