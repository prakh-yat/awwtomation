"use client";

import * as React from "react";
import { Ban, ChevronDown, Tag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ContactTagCount, TagMatchMode } from "@/lib/services/contacts";
import { cn } from "@/lib/utils";

export interface TagFilterPopoverProps {
  options: ContactTagCount[];
  selected: string[];
  mode: TagMatchMode;
  onChange: (next: { tags: string[]; mode: TagMatchMode }) => void;
  /** "Exclude tags" variant: contacts carrying any selected tag are hidden; no match-mode toggle. */
  exclude?: boolean;
}

/** Multi-select tag filter with an all/any toggle. Selected tags that no longer exist stay listed so they can be unticked. */
function TagFilterPopover({ options, selected, mode, onChange, exclude = false }: TagFilterPopoverProps) {
  const [query, setQuery] = React.useState("");
  const idPrefix = exclude ? "tag-exclude" : "tag-filter";

  const rows = React.useMemo(() => {
    const known = new Set(options.map((o) => o.tag));
    const extra = selected.filter((t) => !known.has(t)).map((tag) => ({ tag, count: 0 }));
    const all = [...extra, ...options];
    const q = query.trim().toLowerCase();
    return q ? all.filter((o) => o.tag.toLowerCase().includes(q)) : all;
  }, [options, selected, query]);

  function toggle(tag: string, checked: boolean) {
    const next = checked ? [...selected, tag] : selected.filter((t) => t !== tag);
    onChange({ tags: next, mode });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-1.5", selected.length > 0 && "border-foreground")}>
          {exclude ? <Ban /> : <Tag />}
          {exclude ? "Exclude" : "Tags"}
          {selected.length > 0 ? (
            <Badge variant="default" className="ml-0.5 h-4 min-w-4 justify-center px-1 tabular-nums">
              {selected.length}
            </Badge>
          ) : null}
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="border-b p-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a tag…" className="h-8 text-[13px]" autoFocus />
        </div>
        <div className="max-h-60 overflow-auto p-1">
          {rows.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">{options.length === 0 ? "No tags yet" : "No matching tags"}</p>
          ) : (
            rows.map((row) => {
              const checked = selected.includes(row.tag);
              const id = `${idPrefix}-${row.tag}`;
              return (
                <label
                  key={row.tag}
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] transition-colors hover:bg-accent"
                >
                  <Checkbox id={id} checked={checked} onCheckedChange={(v) => toggle(row.tag, v === true)} />
                  <span className="flex-1 truncate">{row.tag}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{row.count}</span>
                </label>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t p-2">
          {exclude ? (
            <span className="px-1 text-[12px] text-muted-foreground">Hides contacts with any of these</span>
          ) : (
            <div className="inline-flex h-7 items-center rounded-md bg-muted p-0.5 text-[12px]" role="radiogroup" aria-label="Match mode">
              {(["all", "any"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => onChange({ tags: selected, mode: m })}
                  className={cn(
                    "h-6 rounded-[5px] px-2 font-medium transition-colors",
                    mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "all" ? "Match all" : "Match any"}
                </button>
              ))}
            </div>
          )}
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={selected.length === 0} onClick={() => onChange({ tags: [], mode })}>
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { TagFilterPopover };
