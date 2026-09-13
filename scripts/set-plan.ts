/**
 * Operator tool: put an organization on a plan without a subscription (a comped
 * client, a partner, a support fix). There is deliberately no page for this —
 * the app shows customers their own data only.
 *
 *   npx tsx scripts/set-plan.ts list                        # organizations and their plans
 *   npx tsx scripts/set-plan.ts set <organization> <plan>   # FREE | STARTER | PRO | AGENCY
 *   npx tsx scripts/set-plan.ts clear <organization>        # back to subscription / free
 *
 * <organization> is an organization id or slug, or the id or slug of any
 * workspace inside it. Reads DATABASE_URL from .env.
 *
 * `set` marks the plan as an override, so Dodo webhooks won't change it. `clear`
 * removes the override and, if the organization has a subscription, re-reads it
 * from Dodo so the plan matches what they pay for.
 */
import "dotenv/config";

import { PlanTier, PrismaClient } from "@prisma/client";

import { syncSubscription } from "@/lib/services/billing";

const prisma = new PrismaClient();

const PLANS = Object.values(PlanTier);

function usage(message?: string): never {
  if (message) console.error(`\n${message}`);
  console.error(`
Usage:
  npx tsx scripts/set-plan.ts list
  npx tsx scripts/set-plan.ts set <organization-or-workspace> <${PLANS.join("|")}>
  npx tsx scripts/set-plan.ts clear <organization-or-workspace>
`);
  process.exit(1);
}

const orgSelect = { id: true, name: true, slug: true, plan: true, planSource: true, billingSubscriptionId: true } as const;

async function findOrganization(ref: string) {
  const direct = await prisma.organization.findFirst({ where: { OR: [{ id: ref }, { slug: ref }] }, select: orgSelect });
  if (direct) return direct;
  const workspace = await prisma.workspace.findFirst({
    where: { OR: [{ id: ref }, { slug: ref }] },
    select: { organization: { select: orgSelect } },
  });
  if (!workspace) usage(`No organization or workspace with id or slug "${ref}".`);
  return workspace.organization;
}

async function list() {
  const rows = await prisma.organization.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, name: true, plan: true, planSource: true, billingStatus: true, _count: { select: { workspaces: true } } },
  });
  if (rows.length === 0) {
    console.log("No organizations.");
    return;
  }
  console.table(
    rows.map((o) => ({
      slug: o.slug,
      name: o.name,
      plan: o.plan,
      source: o.planSource === "ADMIN_OVERRIDE" ? "override" : o.planSource.toLowerCase(),
      billing: o.billingStatus.toLowerCase(),
      workspaces: o._count.workspaces,
      id: o.id,
    })),
  );
}

async function set(ref: string, planArg: string) {
  const plan = planArg?.toUpperCase() as PlanTier;
  if (!PLANS.includes(plan)) usage(`Unknown plan "${planArg}".`);
  const org = await findOrganization(ref);

  await prisma.$transaction([
    prisma.organization.update({ where: { id: org.id }, data: { plan, planSource: "ADMIN_OVERRIDE" } }),
    prisma.auditLog.create({
      data: {
        action: "operator.plan_set",
        targetType: "organization",
        targetId: org.id,
        metadata: { from: org.plan, to: plan, previousSource: org.planSource },
      },
    }),
  ]);
  console.log(`${org.name}: ${org.plan} -> ${plan} (override)`);
}

async function clear(ref: string) {
  const org = await findOrganization(ref);
  if (org.planSource !== "ADMIN_OVERRIDE") {
    console.log(`${org.name} has no override (plan ${org.plan}, source ${org.planSource}).`);
    return;
  }

  // Drop the override first so the subscription sync is allowed to write the plan.
  await prisma.organization.update({ where: { id: org.id }, data: { planSource: "DEFAULT", plan: "FREE" } });
  if (org.billingSubscriptionId) {
    try {
      await syncSubscription(org.billingSubscriptionId);
    } catch (err) {
      console.warn(`Could not reach Dodo (${err instanceof Error ? err.message : String(err)}).`);
      console.warn("The organization is on FREE until the next billing webhook arrives.");
    }
  }

  const after = await prisma.organization.findUniqueOrThrow({ where: { id: org.id }, select: { plan: true, planSource: true } });
  await prisma.auditLog.create({
    data: {
      action: "operator.plan_override_cleared",
      targetType: "organization",
      targetId: org.id,
      metadata: { from: org.plan, to: after.plan, source: after.planSource },
    },
  });
  console.log(`${org.name}: override removed, now ${after.plan} (${after.planSource.toLowerCase()})`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "list":
      return list();
    case "set":
      if (args.length !== 2) usage();
      return set(args[0], args[1]);
    case "clear":
      if (args.length !== 1) usage();
      return clear(args[0]);
    default:
      usage();
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
