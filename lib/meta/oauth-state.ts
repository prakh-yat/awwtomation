import { ChannelPlatform } from "@prisma/client";
import { z } from "zod";
import { randomToken, signState, verifyState } from "@/lib/crypto";

/**
 * Signed OAuth `state` for the Instagram / Facebook connect flows. Binds the
 * callback to the workspace + user that started it so a stolen redirect can't
 * attach someone else's account to another tenant.
 */
export const oauthStateSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  platform: z.nativeEnum(ChannelPlatform),
  nonce: z.string().min(8),
  iat: z.number().int().positive(),
});

export type OAuthStatePayload = z.infer<typeof oauthStateSchema>;

export const OAUTH_STATE_MAX_AGE_SECONDS = 15 * 60;

export function newOAuthNonce(): string {
  return randomToken(16);
}

export function buildOAuthState(input: {
  workspaceId: string;
  userId: string;
  platform: ChannelPlatform;
  nonce?: string;
  iat?: number;
}): string {
  const payload: OAuthStatePayload = {
    workspaceId: input.workspaceId,
    userId: input.userId,
    platform: input.platform,
    nonce: input.nonce ?? newOAuthNonce(),
    iat: input.iat ?? Math.floor(Date.now() / 1000),
  };
  return signState(payload);
}

/** Throws on bad signature, expiry (15 min) or malformed payload. */
export function parseOAuthState(state: string, opts: { maxAgeSeconds?: number } = {}): OAuthStatePayload {
  const raw = verifyState<unknown>(state, opts.maxAgeSeconds ?? OAUTH_STATE_MAX_AGE_SECONDS);
  const parsed = oauthStateSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Malformed OAuth state payload");
  return parsed.data;
}
