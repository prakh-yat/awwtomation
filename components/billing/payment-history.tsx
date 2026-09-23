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
        tone="fog"
        compact
        className="border bg-background"
        title="No payments yet"
        description={hasSubscription ? "Your first receipt shows up here once the payment clears." : undefined}
      />
    );
  }

  // Invoice links arrive with the payment webhook; hide the column rather than show a row of dashes until one exists.
  const hasInvoices = payments.some((p) => p.invoiceUrl);

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Date</TableHead>
            <TableHead className="hidden sm:table-cell">Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className={hasInvoices ? undefined : "pr-5"}>Status</TableHead>
            {hasInvoices ? <TableHead className="pr-5 text-right">Invoice</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p, i) => (
            <TableRow key={p.id} className="rise" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
              <TableCell className="whitespace-nowrap pl-5">
                <span className="tabular-nums text-muted-foreground">{formatDate(p.paidAt ?? p.createdAt)}</span>
                {/* The description column is dropped on phones; it rides under the date instead. */}
                <span className="mt-0.5 block max-w-[10rem] truncate font-medium text-ink sm:hidden">{p.description ?? "Payment"}</span>
              </TableCell>
              <TableCell className="hidden font-medium sm:table-cell">{p.description ?? "Payment"}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatAmount(p.amountCents, p.currency)}</TableCell>
              <TableCell className={hasInvoices ? undefined : "pr-5"}>
                <PaymentStatusBadge status={p.status} />
              </TableCell>
              {hasInvoices ? (
                <TableCell className="pr-5 text-right">
                  {p.invoiceUrl ? (
                    <a
                      href={p.invoiceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-ink outline-none transition-colors hover:bg-fog focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Download className="h-3.5 w-3.5" />
                      PDF
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">–</span>
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
