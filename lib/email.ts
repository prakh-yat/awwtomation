/**
 * Transactional email through Resend's HTTP API.
 *
 * Plain text only: these are operational notices (an account needs
 * reconnecting, the queue has stopped), read on a phone, and a text email is
 * never mangled by a mail client. No SDK: one POST is all it takes.
 *
 * Never throws. Without RESEND_API_KEY and EMAIL_FROM the message is logged
 * instead of sent, so local development and self-hosters without email lose
 * nothing but the email.
 */
import { optionalEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export type EmailMessage = {
  to: string | string[];
  subject: string;
  /** Plain text. Keep lines short; mail clients wrap them anyway. */
  text: string;
  /** Groups related messages in Resend's dashboard, e.g. "channel-alert". */
  tag?: string;
};

export type EmailResult = { sent: true; id: string | null } | { sent: false; reason: "not_configured" | "no_recipients" | "failed" };

export function isEmailConfigured(): boolean {
  return Boolean(optionalEnv("RESEND_API_KEY") && optionalEnv("EMAIL_FROM"));
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const to = (Array.isArray(message.to) ? message.to : [message.to]).map((a) => a.trim()).filter(Boolean);
  if (to.length === 0) return { sent: false, reason: "no_recipients" };

  const apiKey = optionalEnv("RESEND_API_KEY");
  const from = optionalEnv("EMAIL_FROM");
  if (!apiKey || !from) {
    logger.info("email.not_configured", { subject: message.subject, recipients: to.length, tag: message.tag });
    return { sent: false, reason: "not_configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: message.subject,
        text: message.text,
        ...(message.tag ? { tags: [{ name: "category", value: message.tag }] } : {}),
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!response.ok) {
      logger.error("email.send_failed", { status: response.status, error: body?.message ?? null, tag: message.tag });
      return { sent: false, reason: "failed" };
    }
    logger.info("email.sent", { recipients: to.length, tag: message.tag });
    return { sent: true, id: body?.id ?? null };
  } catch (err) {
    logger.error("email.send_failed", { error: err instanceof Error ? err.message : String(err), tag: message.tag });
    return { sent: false, reason: "failed" };
  } finally {
    clearTimeout(timer);
  }
}
