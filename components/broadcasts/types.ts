/**
 * Client-safe types and limits for the broadcast UI. Server modules
 * (lib/services/broadcasts, lib/meta/messages) pull in Prisma/Buffer, so the
 * browser bundle gets these thin mirrors instead. Type-only imports from the
 * service are erased at build time and are fine.
 */
import type { ChannelPlatform, ChannelStatus } from "@prisma/client";

export type { AudienceEstimate, BroadcastAudience, BroadcastRow, BroadcastStats } from "@/lib/services/broadcasts";
export type { SegmentSummary } from "@/lib/services/segments";

// Mirrors lib/meta/messages.ts — keep in sync.
export const TEXT_MAX_BYTES = 1000;
export const TEXT_WITH_BUTTONS_MAX_CHARS = 640;
export const MAX_BUTTONS = 3;
export const BUTTON_TITLE_MAX_CHARS = 20;
export const NAME_MAX_CHARS = 80;

export type ChannelOption = {
  id: string;
  platform: ChannelPlatform;
  username: string | null;
  name: string | null;
  status: ChannelStatus;
};

export type TagOption = { tag: string; count: number };

/** Editable button shape — broadcasts only support links. */
export type DraftButton = { title: string; url: string };

export type DraftMessage = { text: string; buttons: DraftButton[]; imageUrl: string };

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function charLength(value: string): number {
  return Array.from(value).length;
}
