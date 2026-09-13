"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { toast } from "@/components/ui/sonner";

import { channelDisplayName } from "./channel-status";

/** Messages keyed by the `?error=` values produced by app/api/meta/* and the select route. */
const ERROR_MESSAGES: Record<string, string> = {
  denied: "The connection was cancelled on Meta's side. Try again when you're ready.",
  plan_limit: "You've reached the connected-account limit for your plan. Disconnect one or upgrade.",
  not_configured: "Connecting accounts isn't available right now. Please try again later.",
  invalid_state: "That connection link is invalid or has expired. Start again from this page.",
  session: "The connection was started by a different user. Sign in with that account and try again.",
  forbidden: "Only workspace admins can connect accounts.",
  meta: "Instagram or Facebook couldn't finish connecting the account.",
  channel_claimed: "This account is already connected to another workspace.",
  no_pages: "Your Facebook account doesn't manage any Pages. Create a Page first, then connect it.",
  fb_session_expired: "Your Facebook sign-in expired before you picked a Page. Start again.",
  page_not_found: "One of the selected Pages is no longer available on your Facebook account.",
  unknown: "Something went wrong while connecting. Please try again.",
};

type ToastChannel = { id: string; username: string | null; name: string | null; platform: "INSTAGRAM" | "FACEBOOK" };

const CONSUMED_PARAMS = ["connected", "error", "message", "platform"];

/**
 * Turns `?connected=` / `?error=` (set by the OAuth callbacks) into toasts,
 * then strips those params so a reload doesn't repeat them. Other params
 * (e.g. `?onboarding=1`) are preserved.
 */
export function ChannelsToasts({ channels }: { channels: ToastChannel[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // React strict mode runs effects twice in dev; the toast must fire once.
  const handled = React.useRef<string | null>(null);

  React.useEffect(() => {
    const key = searchParams.toString();
    if (!key || handled.current === key) return;

    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    const message = searchParams.get("message");
    if (!connected && !error) return;
    handled.current = key;

    if (connected) {
      const ids = connected.split(",").filter(Boolean);
      const matched = ids.map((id) => channels.find((c) => c.id === id)).filter((c): c is ToastChannel => Boolean(c));
      if (matched.length === 1) {
        toast.success(`Connected ${channelDisplayName(matched[0])}`, {
          description: "Its posts are loading in the background. You can create an automation now.",
        });
      } else {
        toast.success(`Connected ${ids.length} account${ids.length === 1 ? "" : "s"}`, {
          description: "Their posts are loading in the background.",
        });
      }
    }

    if (error) {
      toast.error(ERROR_MESSAGES[error] ?? ERROR_MESSAGES.unknown, message ? { description: message } : undefined);
    }

    const next = new URLSearchParams(searchParams);
    for (const param of CONSUMED_PARAMS) next.delete(param);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [searchParams, channels, router, pathname]);

  return null;
}
