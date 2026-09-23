"use client";

import * as React from "react";
import { Check, ChevronsUpDown, LoaderCircle, RefreshCw, Search } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Item = { key: string; value: string | null; label: string; group: string };

export type ModelPickerProps = {
  id?: string;
  /** The chosen model id; null picks the default the caller describes in `defaultLabel`. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** The provider's live list, or null while it has not loaded (or cannot load). */
  models: string[] | null;
  suggestions: readonly string[];
  loading?: boolean;
  error?: string | null;
  onReload?: () => void;
  /** When set, offers "use the default" as the first option. */
  defaultLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
};

/**
 * Searchable model list: suggestions first, then everything the key can use,
 * and whatever is typed can be used as is, because providers ship new model
 * names faster than any list.
 */
export function ModelPicker({ id, value, onChange, models, suggestions, loading, error, onReload, defaultLabel, disabled, invalid }: ModelPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  const items = React.useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = (m: string) => !q || m.toLowerCase().includes(q);
    const out: Item[] = [];
    if (defaultLabel && !q) out.push({ key: "__default__", value: null, label: defaultLabel, group: "Default" });

    // Suggestions only when the live list confirms them, or when there is no list yet.
    const live = models ? new Set(models) : null;
    const suggested = suggestions.filter((m) => (!live || live.has(m)) && matches(m));
    for (const m of suggested) out.push({ key: `s:${m}`, value: m, label: m, group: "Suggested" });

    if (models) {
      const taken = new Set(suggested);
      for (const m of models) if (!taken.has(m) && matches(m)) out.push({ key: `a:${m}`, value: m, label: m, group: "All models" });
    }

    const typed = query.trim();
    if (typed && !out.some((i) => i.value === typed)) out.push({ key: "__typed__", value: typed, label: typed, group: "Use this name" });
    return out;
  }, [query, models, suggestions, defaultLabel]);

  React.useEffect(() => {
    setActive(0);
  }, [query, open]);

  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function pick(item: Item) {
    onChange(item.value);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[active];
      if (item) pick(item);
    }
  }

  const shown = value ?? defaultLabel ?? "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3.5 text-left text-sm transition-[border-color,box-shadow]",
            "hover:border-ink/30 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15 data-[state=open]:border-ink",
            "disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive",
          )}
        >
          <span className={cn("min-w-0 truncate", value ? "font-mono text-[13px]" : "text-muted-foreground")}>{shown || "Choose a model"}</span>
          {loading ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[18rem] p-0">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search or type a model name"
            aria-label="Search models"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {onReload ? (
            <button
              type="button"
              onClick={onReload}
              aria-label="Reload the model list"
              title="Reload"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-fog hover:text-ink"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          ) : null}
        </div>

        <div ref={listRef} id={listId} role="listbox" className="scrollbar-thin max-h-72 overflow-y-auto p-1.5">
          {items.length === 0 ? <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">Type a model name to use it.</p> : null}
          {items.map((item, index) => {
            const first = index === 0 || items[index - 1].group !== item.group;
            const selected = item.value === value;
            return (
              <React.Fragment key={item.key}>
                {first ? <p className="brand-label px-2.5 pb-1 pt-2.5 text-muted-foreground">{item.group}</p> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-index={index}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(item)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] outline-none",
                    index === active ? "bg-fog" : null,
                    item.value ? "font-mono" : null,
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {selected ? <Check className="h-4 w-4 shrink-0 text-purple" strokeWidth={2.5} /> : null}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {error ? <p className="border-t px-3 py-2 text-[12px] text-muted-foreground">{error}</p> : null}
      </PopoverContent>
    </Popover>
  );
}
