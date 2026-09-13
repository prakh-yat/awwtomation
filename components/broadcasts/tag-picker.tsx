"use client";

import * as React from "react";
import { Check, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { TagOption } from "./types";

export interface TagPickerProps {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
  /** Known tags with usage counts (from /api/contacts/tags). Free-text entry is always allowed. */
  options: TagOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Rendered when nothing is selected. */
  emptyLabel?: string;
}

const MAX_TAG_LENGTH = 64;

/**
 * Chips + popover multi-select. Tags may not exist yet (the contacts lane
 * assigns them), so anything typed can be added as-is.
 */
function TagPicker({ id, value, onChange, options, placeholder = "Search tags…", disabled = false, emptyLabel = "Any contact" }: TagPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();

  const filtered = React.useMemo(() => {
    const list = q ? options.filter((o) => o.tag.toLowerCase().includes(q)) : options;
    return list.slice(0, 50);
  }, [options, q]);

  const exactExists = options.some((o) => o.tag.toLowerCase() === q) || value.some((t) => t.toLowerCase() === q);
  const canCreate = q.length > 0 && q.length <= MAX_TAG_LENGTH && !exactExists;

  function toggle(tag: string) {
    const clean = tag.trim();
    if (!clean) return;
    if (value.includes(clean)) onChange(value.filter((t) => t !== clean));
    else onChange([...value, clean]);
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const match = filtered.find((o) => o.tag.toLowerCase() === q) ?? filtered[0];
      if (canCreate && !match) toggle(query);
      else if (match) toggle(match.tag);
      setQuery("");
    } else if (e.key === "Backspace" && !query && value.length) {
      remove(value[value.length - 1]);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.length === 0 ? <span className="text-[13px] text-muted-foreground">{emptyLabel}</span> : null}
      {value.map((tag) => (
        <span key={tag} className="inline-flex h-7 items-center gap-1 rounded-md border bg-background pl-2 pr-1 text-[12px] font-medium">
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            disabled={disabled}
            aria-label={`Remove ${tag}`}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" size="sm" disabled={disabled} className="h-7 px-2">
            <Plus />
            Add tag
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            maxLength={MAX_TAG_LENGTH}
            className="h-8 text-[13px]"
            aria-label="Search tags"
          />
          <ul className="scrollbar-thin mt-2 max-h-56 space-y-0.5 overflow-y-auto" role="listbox" aria-multiselectable>
            {filtered.map((o) => {
              const selected = value.includes(o.tag);
              return (
                <li key={o.tag}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => toggle(o.tag)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
                      selected && "font-medium",
                    )}
                  >
                    <span className="flex h-3.5 w-3.5 items-center justify-center">{selected ? <Check className="h-3.5 w-3.5" /> : null}</span>
                    <span className="min-w-0 flex-1 truncate">{o.tag}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{o.count}</span>
                  </button>
                </li>
              );
            })}
            {canCreate ? (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    toggle(query);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="truncate">
                    Add “{query.trim()}”
                  </span>
                </button>
              </li>
            ) : null}
            {filtered.length === 0 && !canCreate ? (
              <li className="px-2 py-3 text-center text-[12px] text-muted-foreground">
                {options.length === 0 ? "No tags yet. Type one to add it." : "No matching tags"}
              </li>
            ) : null}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export { TagPicker };
