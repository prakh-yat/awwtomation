import type { PaymentStatus } from "@prisma/client";

import { Badge, type BadgeProps, type BadgeVariant } from "@/components/ui/badge";
import type { ServiceTone } from "@/lib/billing/entitlements";

const TONE_VARIANT: Record<ServiceTone, BadgeVariant> = {
  neutral: "outline",
  success: "success",
  warning: "warning",
  destructive: "destructive",
};

/** Solid fills for the same tones, readable on the ink plan block. */
const TONE_ON_DARK: Record<ServiceTone, string> = {
  neutral: "border-transparent bg-white/15 text-white",
  success: "bg-green text-white",
  warning: "bg-orange text-ink",
  destructive: "bg-destructive text-white",
};

/** Plan-card badge driven by `serviceStateInfo` so copy and colour stay in sync with entitlements. */
export function ServiceStateBadge({ label, tone, onDark = false }: { label: string; tone: ServiceTone; onDark?: boolean }) {
  return (
    <Badge variant={TONE_VARIANT[tone]} dot={tone === "success"} className={onDark ? TONE_ON_DARK[tone] : undefined}>
      {label}
    </Badge>
  );
}

const PAYMENT_META: Record<PaymentStatus, { label: string; variant: NonNullable<BadgeProps["variant"]>; dot?: BadgeProps["dot"] }> = {
  SUCCEEDED: { label: "Paid", variant: "success" },
  PENDING: { label: "Pending", variant: "blue", dot: "pulse" },
  FAILED: { label: "Failed", variant: "destructive" },
  REFUNDED: { label: "Refunded", variant: "secondary" },
  DISPUTED: { label: "Disputed", variant: "warning" },
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const meta = PAYMENT_META[status];
  return (
    <Badge variant={meta.variant} dot={meta.dot}>
      {meta.label}
    </Badge>
  );
}
