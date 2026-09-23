import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The background patterns in globals.css are not colours. Left to the default
 * rules, `cn("bg-yellow", "bg-grid")` would drop the yellow, so each pattern
 * gets a group of its own.
 */
const twMerge = extendTailwindMerge<"bg-grid" | "bg-grid-light" | "bg-dots">({
  extend: {
    classGroups: {
      "bg-grid": ["bg-grid"],
      "bg-grid-light": ["bg-grid-light"],
      "bg-dots": ["bg-dots"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workspace";
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}

export function formatPercent(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function truncate(s: string, max = 80): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function initials(name?: string | null, fallback = "?"): string {
  if (!name) return fallback;
  const clean = name.trim().replace(/^@+/, "");
  // "Sita Rai" → SR; a handle like "kabita.chaudhary" → KC rather than "@" or "K".
  const parts = (/\s/.test(clean) ? clean.split(/\s+/) : clean.split(/[._-]+/)).filter(Boolean).slice(0, 2);
  return parts.map((p) => p.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() ?? "").join("") || fallback;
}

/** Guard against open redirects: only allow same-origin absolute paths. */
export function sanitizeNextPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}
