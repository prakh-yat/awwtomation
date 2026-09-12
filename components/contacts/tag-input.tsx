"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Existing workspace tags offered as completions (already-selected ones are hidden). */
  suggestions?: string[];
  placeholder?: string;
  disabled?: boolean;
  /** Only allow picking from `suggestions` (used for "remove tag" where inventing a tag makes no sense). */
  restrictToSuggestions?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  className?: string;
  id?: string;
}

/**
 * Chips + free-text input with a completion list. Enter, Tab or comma commits
 * the typed value; Backspace on an empty input pops the last chip. Kept
 * dependency-free (no cmdk) to stay inside the installed package set.
 */
function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Add a tag…",
  disabled = false,
  restrictToSuggestions = false,
  maxLength = 64,
  autoFocus,
  className,
  id,
}: TagInputProps) {
  const [draft, setDraft] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  const query = draft.trim().toLowerCase();
  const options = React.useMemo(() => {
    const selected = new Set(value);
    const matches = suggestions.filter((s) => !selected.has(s) && (!query || s.toLowerCase().includes(query))).slice(0, 8);
    const exact = matches.some((s) => s.toLowerCase() === query);
    const canCreate = !restrictToSuggestions && query.length > 0 && !exact && !selected.has(draft.trim());
    return { matches, canCreate };
  }, [suggestions, value, query, draft, restrictToSuggestions]);

  const items: Array<{ kind: "suggestion" | "create"; label: string }> = [
    ...options.matches.map((label) => ({ kind: "suggestion" as const, label })),
    ...(options.canCreate ? [{ kind: "create" as const, label: draft.trim() }] : []),
  ];

  React.useEffect(() => {
    setHighlight(0);
  }, [draft]);

  // Close on outside click; the list is rendered inline (not portalled) so a document listener is enough.
  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function commit(raw: string) {
    const tag = raw.trim().slice(0, maxLength);
    if (!tag) return;
    if (restrictToSuggestions && !suggestions.includes(tag)) return;
    if (!value.includes(tag)) onChange([...value, tag]);
    setDraft("");
    setOpen(false);
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(items.length - 1, 0)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter" || e.key === "," || (e.key === "Tab" && draft.trim())) {
      const target = open && items[highlight] ? items[highlight].label : draft;
      if (e.key !== "Tab" || target.trim()) e.preventDefault();
      commit(target);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  const showList = open && items.length > 0;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-colors",
          "focus-within:border-foreground focus-within:ring-2 focus-within:ring-ring",
          disabled && "cursor-not-allowed opacity-50",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <span key={tag} className="inline-flex h-6 items-center gap-1 rounded-full bg-secondary pl-2 pr-1 text-[12px] font-medium text-secondary-foreground">
            <span className="max-w-[12rem] truncate">{tag}</span>
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                remove(tag);
              }}
              className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled}
          value={draft}
          placeholder={value.length === 0 ? placeholder : ""}
          maxLength={maxLength}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-6 min-w-[8rem] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-elevated"
        >
          {items.map((item, i) => (
            <li
              key={`${item.kind}:${item.label}`}
              role="option"
              aria-selected={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                // mousedown (not click) so the input doesn't blur first.
                e.preventDefault();
                commit(item.label);
              }}
              className={cn(
                "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-[13px]",
                i === highlight ? "bg-accent text-accent-foreground" : "text-foreground",
              )}
            >
              {item.kind === "create" ? (
                <>
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>
                    Create <span className="font-medium">&ldquo;{item.label}&rdquo;</span>
                  </span>
                </>
              ) : (
                <span className="truncate">{item.label}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export { TagInput };
