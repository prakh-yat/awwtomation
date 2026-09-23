import type { Tone } from "@/components/ui/tone";

/** Tones a tag can take: the accents with a readable soft tint. */
const TAG_TONES: readonly Tone[] = ["magenta", "purple", "indigo", "blue", "green", "orange", "sky", "lavender", "yellow"];

/**
 * A stable colour per tag name, so "vip" is the same colour in every thread
 * without anyone having to pick one. Case-insensitive, like tag matching.
 */
export function tagTone(tag: string): Tone {
  let hash = 0;
  for (const char of tag.trim().toLowerCase()) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) | 0;
  }
  return TAG_TONES[Math.abs(hash) % TAG_TONES.length];
}
