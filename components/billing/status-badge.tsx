import type { PaymentStatus } from "@prisma/client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { ServiceTone } from "@/lib/billing/entitlements";

const TONE_VARIANT: Record<ServiceTone, NonNullable<BadgeProps["variant"]>> = {
  neutral: "outline",
  success: "success",
  warning: "warning",
  destructive: "destructive",
};

/** Plan-card badge driven by `serviceStateInfo` so copy and colour stay in sync with entitlements. */
export function ServiceStateBadge({ label, tone }: { label: string; tone: ServiceTone }) {
  return <Badge variant={TONE_VARIANT[tone]}>{label}</Badge>;
}

const PAYMENT_META: Record<PaymentStatus, { label: string; variant: NonNullable<BadgeProps["variant"]> }> = {
  SUCCEEDED: { label: "Paid", variant: "success" },
  PENDING: { label: "Pending", variant: "outline" },
  FAILED: { label: "Failed", variant: "destructive" },
  REFUNDED: { label: "Refunded", variant: "secondary" },
  DISPUTED: { label: "Disputed", variant: "warning" },
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const meta = PAYMENT_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
