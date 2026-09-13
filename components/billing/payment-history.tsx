import { Download, Receipt } from "lucide-react";

import { PaymentStatusBadge } from "@/components/billing/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PaymentRow } from "@/lib/services/billing";

function formatAmount(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Server component: receipts are read straight from the Payment table populated by webhooks. */
export function PaymentHistory({ payments, hasSubscription }: { payments: PaymentRow[]; hasSubscription: boolean }) {
  if (payments.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No payments yet"
        description={
          hasSubscription
            ? "Your first receipt appears here once the payment is confirmed."
            : "Receipts and invoices for paid plans will be listed here."
        }
      />
    );
  }

  // Invoice links arrive with the payment webhook; hide the column rather than show a row of dashes until one exists.
  const hasInvoices = payments.some((p) => p.invoiceUrl);

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            {hasInvoices ? <TableHead className="text-right">Invoice</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{formatDate(p.paidAt ?? p.createdAt)}</TableCell>
              <TableCell className="font-medium">{p.description ?? "Payment"}</TableCell>
              <TableCell className="text-right tabular-nums">{formatAmount(p.amountCents, p.currency)}</TableCell>
              <TableCell>
                <PaymentStatusBadge status={p.status} />
              </TableCell>
              {hasInvoices ? (
              <TableCell className="text-right">
                {p.invoiceUrl ? (
                  <a
                    href={p.invoiceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
