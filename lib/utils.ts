import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || fallback;
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
