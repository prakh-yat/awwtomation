"use client";

import * as React from "react";
import { Ban, ChevronDown, Search, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import type { ContactTagCount, TagMatchMode } from "@/lib/services/contacts";

import { filterPill, PillCount } from "./filter-pill";

export interface TagFilterPopoverProps {
  options: ContactTagCount[];
  selected: string[];
  mode: TagMatchMode;
  onChange: (next: { tags: string[]; mode: TagMatchMode }) => void;
  /** "Exclude tags" variant: contacts carrying any selected tag are hidden; no match-mode toggle. */
  exclude?: boolean;
}

const MODES: SegmentedOption<TagMatchMode>[] = [
  { value: "all", label: "Match all" },
  { value: "any", label: "Match any" },
];

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
        <Button variant="outline" size="sm" className={filterPill(selected.length > 0)}>
          {exclude ? <Ban /> : <Tag />}
          {exclude ? "Exclude" : "Tags"}
          {selected.length > 0 ? <PillCount count={selected.length} /> : null}
          <ChevronDown className="-mr-0.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 overflow-hidden p-0">
        <div className="relative border-b p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a tag…"
            aria-label="Find a tag"
            className="h-8 rounded-full pl-8 text-[13px]"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-auto p-1.5">
          {rows.length === 0 ? (
            <p className="px-2 py-8 text-center text-[13px] text-muted-foreground">{options.length === 0 ? "No tags yet" : "No matching tags"}</p>
          ) : (
            rows.map((row) => {
              const checked = selected.includes(row.tag);
              const id = `${idPrefix}-${row.tag}`;
              return (
                <label key={row.tag} htmlFor={id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] transition-colors hover:bg-fog">
                  <Checkbox id={id} checked={checked} onCheckedChange={(v) => toggle(row.tag, v === true)} />
                  <span className="min-w-0 flex-1 truncate font-medium">{row.tag}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{row.count}</span>
                </label>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t bg-fog/50 p-2">
          {exclude ? (
            <span className="px-1 text-[12px] text-muted-foreground">Hides contacts with any of these</span>
          ) : (
            <div className="w-44">
              <Segmented size="sm" value={mode} onChange={(m) => onChange({ tags: selected, mode: m })} options={MODES} aria-label="Match mode" />
            </div>
          )}
          <Button variant="ghost" size="sm" className="px-3 text-muted-foreground hover:text-ink" disabled={selected.length === 0} onClick={() => onChange({ tags: [], mode })}>
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { TagFilterPopover };
