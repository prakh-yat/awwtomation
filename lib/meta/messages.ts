import { metaFetch } from "./client";
import type { OutboundMessage, SendResult } from "./types";

// Meta limits (Send API / Instagram Messaging). Truncating beats a hard error
// mid-flow, but `validateFlow` still rejects oversize content at save time.
export const MAX_TEXT_BYTES = 1000;
export const MAX_BUTTON_TEMPLATE_CHARS = 640;
export const MAX_BUTTONS = 3;
export const MAX_BUTTON_TITLE_CHARS = 20;
export const MAX_QUICK_REPLIES = 13;
export const MAX_QUICK_REPLY_TITLE_CHARS = 20;

export function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/** Cut on code-point boundaries so we never emit a broken surrogate pair. */
export function truncateToBytes(value: string, maxBytes: number): string {
  if (utf8Bytes(value) <= maxBytes) return value;
  let out = "";
  let bytes = 0;
  for (const ch of value) {
    const b = utf8Bytes(ch);
    if (bytes + b > maxBytes) break;
    out += ch;
    bytes += b;
  }
  return out;
}

function truncateChars(value: string, max: number): string {
  return Array.from(value).slice(0, max).join("");
}

function hasText(message: OutboundMessage): message is OutboundMessage & { text: string } {
  return typeof message.text === "string" && message.text.trim().length > 0;
}

/**
 * Serialize an OutboundMessage into one or two Graph `message` objects.
 * An image plus text/buttons needs two calls (image first, then the text or
 * button template) because Meta has no "image with buttons" template for
 * Instagram. Quick replies ride on the last payload.
 */
export function buildMessagePayloads(message: OutboundMessage): Record<string, unknown>[] {
  const payloads: Record<string, unknown>[] = [];

  if (message.imageUrl) {
    payloads.push({ attachment: { type: "image", payload: { url: message.imageUrl, is_reusable: false } } });
  }

  const buttons = (message.buttons ?? []).slice(0, MAX_BUTTONS).map((b) =>
    b.type === "web_url"
      ? { type: "web_url", url: b.url, title: truncateChars(b.title, MAX_BUTTON_TITLE_CHARS) }
      : { type: "postback", title: truncateChars(b.title, MAX_BUTTON_TITLE_CHARS), payload: b.payload },
  );

  if (buttons.length > 0) {
    // Button templates require text; fall back to a pointer emoji rather than failing the send.
    const text = truncateChars(hasText(message) ? message.text : "👇", MAX_BUTTON_TEMPLATE_CHARS);
    payloads.push({ attachment: { type: "template", payload: { template_type: "button", text, buttons } } });
  } else if (hasText(message)) {
    payloads.push({ text: truncateToBytes(message.text, MAX_TEXT_BYTES) });
  }

  const quickReplies = (message.quickReplies ?? []).slice(0, MAX_QUICK_REPLIES).map((q) => ({
    content_type: "text",
    title: truncateChars(q.title, MAX_QUICK_REPLY_TITLE_CHARS),
    payload: q.payload,
  }));
  if (quickReplies.length > 0) {
    if (payloads.length === 0) payloads.push({ text: "…" });
    payloads[payloads.length - 1] = { ...payloads[payloads.length - 1], quick_replies: quickReplies };
  }

  return payloads;
}

/** Short human-readable summary for DeliveryLog / conversation previews. */
export function messagePreview(message: OutboundMessage, max = 140): string {
  const text = hasText(message) ? message.text.trim() : "";
  const base = text || (message.imageUrl ? "[image]" : message.buttons?.length ? "[buttons]" : "");
  const chars = Array.from(base);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : base;
}

/**
 * Facebook private replies are text-only. Render buttons as "Title: url"
 * lines so the link still reaches the commenter.
 */
export function messageToPlainText(message: OutboundMessage): string {
  const lines: string[] = [];
  if (hasText(message)) lines.push(message.text.trim());
  for (const button of message.buttons ?? []) {
    if (button.type === "web_url") lines.push(`${button.title}: ${button.url}`);
  }
  if (message.imageUrl && lines.length === 0) lines.push(message.imageUrl);
  return truncateToBytes(lines.join("\n"), MAX_TEXT_BYTES);
}

type GraphSendResponse = { recipient_id?: string | number; message_id?: string; id?: string };

/**
 * Send every payload of an OutboundMessage in order and return the last
 * message id. Used by both the Instagram and Messenger senders: only the URL
 * and the envelope (`recipient`, `messaging_type`, `tag`) differ.
 */
export async function sendOutbound(opts: {
  url: string;
  token: string;
  recipient: Record<string, unknown>;
  message: OutboundMessage;
  extra?: Record<string, unknown>;
}): Promise<SendResult> {
  const payloads = buildMessagePayloads(opts.message);
  if (payloads.length === 0) throw new Error("Cannot send an empty message (no text, image, buttons or quick replies)");

  let last: SendResult = { messageId: null, recipientId: null };
  for (const payload of payloads) {
    const res = await metaFetch<GraphSendResponse>(opts.url, {
      token: opts.token,
      json: { recipient: opts.recipient, message: payload, ...(opts.extra ?? {}) },
    });
    last = {
      messageId: res.message_id ?? res.id ?? null,
      recipientId: res.recipient_id !== undefined ? String(res.recipient_id) : null,
    };
  }
  return last;
}
