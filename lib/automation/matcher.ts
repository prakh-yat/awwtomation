import { AutomationStatus, MatchMode, type Automation, type TriggerType } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * NFKC folds full-width / compatibility forms ("ｌｉｎｋ" → "link"), lower-casing
 * uses locale-independent rules, whitespace is collapsed so "link   please"
 * equals "link please".
 */
export function normalizeText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Escape only regex syntax characters — escaping anything else is a SyntaxError under the `u` flag. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-word matcher that understands Unicode. `\b` only knows ASCII word
 * characters, so "café" or "🔥" would never match with it; instead we require
 * the keyword to not be flanked by letters/digits/underscore.
 */
export function wholeWordPattern(keyword: string): RegExp {
  const escaped = escapeRegExp(keyword);
  try {
    return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu");
  } catch {
    // Engines without lookbehind/property escapes — degrade to ASCII boundaries.
    return new RegExp(`\\b${escaped}\\b`, "i");
  }
}

function keywordMatches(normalizedText: string, keyword: string, mode: MatchMode): boolean {
  const k = normalizeText(keyword);
  if (!k) return false;
  if (mode === MatchMode.EXACT) return wholeWordPattern(k).test(normalizedText);
  return normalizedText.includes(k);
}

/** Returns the first keyword that matches, or null. Exclusions are always "contains". */
export function matchedKeyword(text: string, keywords: string[], mode: MatchMode, exclude: string[] = []): string | null {
  const normalized = normalizeText(text ?? "");
  for (const ex of exclude) {
    const k = normalizeText(ex);
    if (k && normalized.includes(k)) return null;
  }
  if (mode === MatchMode.ANY) return "*";
  for (const keyword of keywords) {
    if (keywordMatches(normalized, keyword, mode)) return keyword;
  }
  return null;
}

/**
 * CONTAINS: keyword anywhere (case-insensitive). EXACT: whole word.
 * ANY: everything (after exclusions). CONTAINS/EXACT with no keywords never
 * match — an empty keyword list is a misconfiguration, not "everyone".
 */
export function matchesKeywords(text: string, keywords: string[], mode: MatchMode, exclude: string[] = []): boolean {
  return matchedKeyword(text, keywords, mode, exclude) !== null;
}

/**
 * ACTIVE automations on the channel for this trigger whose media filter and
 * keywords match. Automations belong to the channel, and the channel was
 * resolved by (platform, externalId) — tenant scoping flows from there.
 */
export async function findMatchingAutomations(channelId: string, trigger: TriggerType, text: string, mediaId?: string): Promise<Automation[]> {
  const candidates = await prisma.automation.findMany({
    where: { channelId, status: AutomationStatus.ACTIVE, triggerType: trigger },
    orderBy: { createdAt: "asc" },
  });
  return candidates.filter((automation) => {
    if (trigger === "COMMENT" && automation.mediaIds.length > 0 && (!mediaId || !automation.mediaIds.includes(mediaId))) return false;
    return matchesKeywords(text, automation.keywords, automation.matchMode, automation.excludeKeywords);
  });
}
