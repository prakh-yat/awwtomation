/**
 * The read-only side: the dashboard, Analytics, delivery Logs, Usage and
 * Billing as tools. Plan changes and payments stay in the app, where the
 * person sees the price and the checkout.
 */
import { DeliveryKind, DeliveryStatus } from "@prisma/client";
import { z } from "zod";

import { appUrl } from "@/lib/env";
import { getAnalytics, getOverview, parseAnalyticsPeriod } from "@/lib/services/analytics";
import { getBillingOverview, listPayments } from "@/lib/services/billing";
import { deliveryLogQuerySchema, exportLogsCsv, getLogStats, listDeliveryLogs } from "@/lib/services/logs";
import { getUsageHistory, USAGE_HISTORY_DEFAULT_MONTHS } from "@/lib/services/usage-history";

import { compact, workspaceTool } from "../tool";

const READ = { readOnlyHint: true, openWorldHint: false } as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const logFilters = {
  status: z.nativeEnum(DeliveryStatus).optional().describe("Only deliveries with this outcome, such as SENT, FAILED or a SKIPPED_ reason."),
  kind: z.nativeEnum(DeliveryKind).optional(),
  channelId: z.string().optional(),
  automationId: z.string().optional(),
  broadcastId: z.string().optional(),
  contactId: z.string().optional(),
  q: z.string().max(120).optional().describe("Recipient @username."),
  from: day.optional().describe("First day, YYYY-MM-DD in the workspace timezone."),
  to: day.optional().describe("Last day, inclusive."),
};

export const reportTools = [
  workspaceTool({
    name: "get_dashboard",
    title: "Dashboard overview",
    description: "The dashboard's numbers for the last 7, 30 or 90 days: DMs sent, automation runs, link clicks and new contacts with the previous period, the daily series, top automations, why messages were skipped, recent activity and plan usage.",
    annotations: READ,
    input: {
      days: z.union([z.literal(7), z.literal(30), z.literal(90)]).optional().describe("Defaults to 7."),
      channelId: z.string().optional().describe("Only this account."),
    },
    run: async (args, ctx) =>
      getOverview(ctx.workspace.id, { days: parseAnalyticsPeriod(args.days === undefined ? undefined : String(args.days)), channelId: args.channelId, timezone: ctx.workspace.timezone }),
  }),

  workspaceTool({
    name: "get_analytics",
    title: "Analytics report",
    description:
      "The full Analytics report for a date range (up to 366 days, and never earlier than the plan's history: 90 days on Starter, 180 on Pro, 365 on Agency, 30 without a plan): daily series, the comment to DM to click funnel, per-account and per-automation tables, top keywords, skip reasons, best hours, inbox response times and pipeline stages.",
    annotations: READ,
    input: {
      from: day.optional().describe("YYYY-MM-DD. Defaults to 29 days before to."),
      to: day.optional().describe("YYYY-MM-DD. Defaults to today."),
      channelId: z.string().optional(),
      automationId: z.string().optional(),
    },
    run: async (args, ctx) => getAnalytics(ctx.workspace.id, { ...compact(args), timezone: ctx.workspace.timezone }),
  }),

  workspaceTool({
    name: "list_delivery_logs",
    title: "Delivery logs",
    description: "Every message the workspace sent or skipped, newest first, with the recipient, automation or broadcast, outcome and reason. The first page also has counts by outcome. Page with cursor.",
    annotations: READ,
    input: {
      ...logFilters,
      cursor: z.string().max(512).optional().describe("nextCursor from the previous page."),
      limit: z.number().int().min(1).max(200).optional().describe("Defaults to 50."),
    },
    run: async (args, ctx) => {
      const query = deliveryLogQuerySchema.parse(compact(args));
      const timezone = ctx.workspace.timezone;
      const { cursor, limit, ...filters } = query;
      const [page, stats] = await Promise.all([
        listDeliveryLogs(ctx.workspace.id, { ...filters, cursor, limit, timezone }),
        cursor ? Promise.resolve(null) : getLogStats(ctx.workspace.id, { ...filters, timezone }),
      ]);
      return { ...page, stats };
    },
  }),

  workspaceTool({
    name: "export_delivery_logs",
    title: "Export delivery logs as CSV",
    description: "Delivery logs matching the filters as CSV text: the same file the Logs page downloads (up to 50,000 rows; long results are cut, so narrow the dates).",
    annotations: READ,
    input: { ...logFilters },
    run: async (args, ctx) => {
      const { cursor: _cursor, limit: _limit, ...filters } = deliveryLogQuerySchema.parse(compact(args));
      return exportLogsCsv(ctx.workspace.id, { ...filters, timezone: ctx.workspace.timezone });
    },
  }),

  workspaceTool({
    name: "get_usage",
    title: "Plan usage",
    description: "The organization's DMs this billing period against the plan limit, the projection to the end of the period, per-account and per-automation use, monthly history and warnings.",
    annotations: READ,
    input: { months: z.number().int().min(1).max(24).optional().describe(`History length. Defaults to ${USAGE_HISTORY_DEFAULT_MONTHS}.`) },
    run: async (args, ctx) => getUsageHistory(ctx.organization.id, args.months ?? USAGE_HISTORY_DEFAULT_MONTHS),
  }),

  workspaceTool({
    name: "get_billing",
    title: "Plan and billing",
    description: `The organization's plan, billing status, renewal date, limits and payments. Changing the plan or payment method happens in the app at ${appUrl("/settings/billing")}. Admins and owners.`,
    minRole: "ADMIN",
    annotations: READ,
    input: {},
    run: async (_args, ctx) => {
      const [overview, payments] = await Promise.all([getBillingOverview(ctx.organization.id), listPayments(ctx.organization.id)]);
      return { ...overview, payments, manageUrl: appUrl("/settings/billing") };
    },
  }),
];
