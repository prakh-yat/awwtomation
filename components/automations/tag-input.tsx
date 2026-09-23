"use client";

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxItems?: number;
  maxLength?: number;
  id?: string;
  className?: string;
  "aria-label"?: string;
}

/**
 * Chip input for keywords. Enter, comma and paste all split values; Backspace
 * on an empty field removes the last chip. Duplicates are ignored
 * case-insensitively because the matcher is case-insensitive anyway.
 */
export function TagInput({ value, onChange, placeholder, disabled, maxItems = 100, maxLength = 80, id, className, ...rest }: TagInputProps) {
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  function commit(raw: string) {
    const parts = raw
      .split(/[,\n]/)
      .map((p) => p.trim().slice(0, maxLength))
      .filter(Boolean);
    if (parts.length === 0) return;
    const seen = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];
    for (const part of parts) {
      const key = part.toLowerCase();
      if (seen.has(key) || next.length >= maxItems) continue;
      seen.add(key);
      next.push(part);
    }
    if (next.length !== value.length) onChange(next);
    setDraft("");
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
    inputRef.current?.focus();
  }

  return (
    <div
      className={cn(
        "flex min-h-10 w-full cursor-text flex-wrap items-center gap-1 rounded-xl border border-input bg-background px-2 py-1.5 text-sm transition-[border-color,box-shadow]",
        "hover:border-ink/30 focus-within:border-ink focus-within:ring-4 focus-within:ring-ring/15",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag, i) => (
        <span key={`${tag}-${i}`} className="inline-flex h-6 max-w-full items-center gap-0.5 rounded-full bg-fog pl-2.5 pr-1 text-[12px] font-semibold text-ink">
          <span className="truncate">{tag}</span>
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              remove(i);
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-ink hover:text-white focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        value={draft}
        disabled={disabled}
        placeholder={value.length === 0 ? placeholder : undefined}
        aria-label={rest["aria-label"]}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            remove(value.length - 1);
          }
        }}
        onBlur={() => commit(draft)}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (text.includes(",") || text.includes("\n")) {
            e.preventDefault();
            commit(text);
          }
        }}
        className="h-6 min-w-[96px] flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
