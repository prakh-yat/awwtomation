"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, KeyRound, MoreHorizontal, Search, SlidersHorizontal, Star, Trash2, Zap } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { BuiltInModel } from "@/lib/ai/builtin";
import { PROVIDER_PRESETS, presetFor, type ProviderPresetId } from "@/lib/ai/presets";
import type { ProviderView } from "@/lib/services/ai";
import { cn } from "@/lib/utils";

import { makeDefaultProvider, testProvider, type ProviderTarget } from "./provider-dialogs";
import { BuiltInLogo, ProviderLogo } from "./provider-logo";

export type ProviderPickerProps = {
  id?: string;
  providers: ProviderView[];
  /** The model that needs no key: what an agent with no connection replies with. */
  builtIn: BuiltInModel;
  /** The connection the agent replies with; null is the built-in model. */
  value: ProviderView | null;
  onChange: (provider: ProviderView | null) => void;
  canManage: boolean;
  /** Picking a provider that is not connected yet asks for its key. */
  onConnect: (preset: ProviderPresetId) => void;
  onManage: (target: ProviderTarget) => void;
  disabled?: boolean;
};

const STATUS_LABEL: Record<string, string> = { INVALID_KEY: "Key refused", ERROR: "Last reply failed" };

function matches(query: string, ...fields: string[]): boolean {
  return !query || fields.some((f) => f.toLowerCase().includes(query));
}

/**
 * Every model source in one list: the built-in model first (no key needed),
 * then the connections this workspace already has, then everything it can
 * connect, each under its own logo. Choosing the built-in model or a
 * connection uses it; choosing a provider opens its key form.
 */
export function ProviderPicker({ id, providers, builtIn, value, onChange, canManage, onConnect, onManage, disabled }: ProviderPickerProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const listRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  const q = query.trim().toLowerCase();
  const showBuiltIn = matches(q, builtIn.label, "built-in", "included", builtIn.model);
  const connected = providers.filter((p) => matches(q, p.label, presetFor(p).name, p.model));
  const available = canManage ? PROVIDER_PRESETS.filter((p) => matches(q, p.name, p.id)) : [];

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  /** Arrow keys walk the options; Tab still reaches each connection's menu. */
  function move(from: HTMLElement | null, step: 1 | -1) {
    const options = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-option]") ?? []);
    if (options.length === 0) return;
    const index = from ? options.indexOf(from) : -1;
    const next = index === -1 ? (step === 1 ? 0 : options.length - 1) : Math.min(Math.max(index + step, 0), options.length - 1);
    options[next]?.focus();
  }

  function onListKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const target = event.target as HTMLElement;
    move(target.hasAttribute("data-option") ? target : null, event.key === "ArrowDown" ? 1 : -1);
  }

  function pickConnected(provider: ProviderView | null) {
    onChange(provider);
    setOpen(false);
  }

  function pickPreset(presetId: ProviderPresetId) {
    setOpen(false);
    onConnect(presetId);
  }

  const preset = value ? presetFor(value) : null;
  const failing = value && value.status !== "ACTIVE";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          className={cn(
            "flex h-11 w-full items-center gap-2.5 rounded-xl border border-input bg-background pl-1.5 pr-3 text-left text-sm transition-[border-color,box-shadow]",
            "hover:border-ink/30 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15 data-[state=open]:border-ink",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {value && preset ? (
            <>
              <ProviderLogo preset={preset} size={30} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate font-semibold">{value.label}</span>
                {failing ? <span className="block truncate text-[11px] font-medium text-destructive">{STATUS_LABEL[value.status]}</span> : null}
              </span>
            </>
          ) : (
            <>
              <BuiltInLogo size={30} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate font-semibold">{builtIn.label}</span>
                <span className={cn("block truncate text-[11px] font-medium", builtIn.available ? "text-muted-foreground" : "text-destructive")}>
                  {builtIn.available ? "No key needed" : "Not set up on this server"}
                </span>
              </span>
            </>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[20rem] p-0">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                move(null, 1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                listRef.current?.querySelector<HTMLElement>("[data-option]")?.click();
              }
            }}
            placeholder="Search providers"
            aria-label="Search providers"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div ref={listRef} id={listId} onKeyDown={onListKeyDown} className="scrollbar-thin max-h-[min(26rem,60vh)] overflow-y-auto p-1.5">
          {showBuiltIn ? (
            <div role="group" aria-label="Included">
              <p className="brand-label px-2.5 pb-1 pt-2 text-muted-foreground">Included</p>
              <button
                type="button"
                data-option=""
                aria-pressed={value === null}
                onClick={() => pickConnected(null)}
                className="flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-2 text-left outline-none transition-colors hover:bg-fog focus-visible:bg-fog"
              >
                <BuiltInLogo size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{builtIn.label}</span>
                  <span className={cn("block truncate text-[11px]", builtIn.available ? "font-mono text-muted-foreground" : "font-medium text-destructive")}>
                    {builtIn.available ? builtIn.model : "Not set up on this server"}
                  </span>
                </span>
                {value === null ? <Check className="h-4 w-4 shrink-0 text-purple" strokeWidth={2.5} /> : null}
              </button>
            </div>
          ) : null}

          {connected.length > 0 ? (
            <div role="group" aria-label="Connected" className={cn(showBuiltIn && "mt-1 border-t pt-1")}>
              <p className="brand-label px-2.5 pb-1 pt-2 text-muted-foreground">Connected</p>
              {connected.map((provider) => {
                const itemPreset = presetFor(provider);
                const selected = provider.id === value?.id;
                const status = STATUS_LABEL[provider.status];
                return (
                  <div key={provider.id} className="group flex items-center rounded-xl transition-colors focus-within:bg-fog hover:bg-fog">
                    <button
                      type="button"
                      data-option=""
                      aria-pressed={selected}
                      onClick={() => pickConnected(provider)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-2 text-left outline-none"
                    >
                      <ProviderLogo preset={itemPreset} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-semibold">{provider.label}</span>
                          {provider.isDefault ? <Star className="h-3 w-3 shrink-0 fill-ink text-ink" aria-label="Default" /> : null}
                        </span>
                        <span className={cn("block truncate text-[11px]", status ? "font-medium text-destructive" : "font-mono text-muted-foreground")}>
                          {status ?? provider.model}
                        </span>
                      </span>
                      {selected ? <Check className="h-4 w-4 shrink-0 text-purple" strokeWidth={2.5} /> : null}
                    </button>
                    {canManage ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Manage ${provider.label}`}
                            className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-background hover:text-ink focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-background data-[state=open]:text-ink"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" side="right" className="w-48">
                          <DropdownMenuItem
                            onSelect={() => {
                              void testProvider(provider).then(() => router.refresh());
                            }}
                          >
                            <Zap /> Test connection
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              setOpen(false);
                              onManage({ action: "model", provider });
                            }}
                          >
                            <SlidersHorizontal /> Default model
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              setOpen(false);
                              onManage({ action: "key", provider });
                            }}
                          >
                            <KeyRound /> Replace key
                          </DropdownMenuItem>
                          {provider.isDefault ? null : (
                            <DropdownMenuItem
                              onSelect={() => {
                                void makeDefaultProvider(provider).then((ok) => ok && router.refresh());
                              }}
                            >
                              <Star /> Make default
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            destructive
                            onSelect={() => {
                              setOpen(false);
                              onManage({ action: "remove", provider });
                            }}
                          >
                            <Trash2 /> Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {available.length > 0 ? (
            <div role="group" aria-label="Connect your own key" className={cn((connected.length > 0 || showBuiltIn) && "mt-1 border-t pt-1")}>
              <p className="brand-label px-2.5 pb-1 pt-2 text-muted-foreground">{providers.length > 0 ? "Connect another key" : "Use your own key"}</p>
              <div className="grid grid-cols-2 gap-0.5">
                {available.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-option=""
                    onClick={() => pickPreset(item.id)}
                    className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left outline-none transition-colors hover:bg-fog focus-visible:bg-fog"
                  >
                    <ProviderLogo preset={item} size={24} />
                    <span className="min-w-0 truncate text-[13px] font-medium">{item.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {!showBuiltIn && connected.length === 0 && available.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">No provider matches.</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
