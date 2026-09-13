/**
 * Operator health check from the command line. The app has no admin pages and
 * `/api/health` only says whether the database answers, so this is where the
 * detail lives: the job queue, recent webhook errors and accounts that need
 * reconnecting, across every workspace.
 *
 *   npx tsx scripts/ops-status.ts
 *
 * Reads DATABASE_URL from .env. Exits with code 1 when something needs
 * attention, so it can run from a cron or CI job.
 */
import "dotenv/config";

import { ChannelStatus, JobStatus, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function ago(date: Date | null | undefined): string {
  if (!date) return "never";
  const minutes = Math.round((Date.now() - date.getTime()) / MINUTE);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

async function main() {
  const now = new Date();
  const [dueJobs, oldestDue, processing, stuck, failed24h, lastTouched, webhookErrors, lastWebhook, reconnect, expiringSoon] = await Promise.all([
    prisma.job.count({ where: { status: JobStatus.PENDING, runAt: { lte: now } } }),
    prisma.job.findFirst({ where: { status: JobStatus.PENDING, runAt: { lte: now } }, orderBy: { runAt: "asc" }, select: { runAt: true, type: true } }),
    prisma.job.count({ where: { status: JobStatus.PROCESSING } }),
    prisma.job.count({ where: { status: JobStatus.PROCESSING, lockedAt: { lt: new Date(now.getTime() - 15 * MINUTE) } } }),
    prisma.job.groupBy({ by: ["type"], where: { status: JobStatus.FAILED, updatedAt: { gte: new Date(now.getTime() - 24 * HOUR) } }, _count: { _all: true } }),
    prisma.job.findFirst({ where: { status: { in: [JobStatus.COMPLETED, JobStatus.FAILED] } }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.webhookEvent.count({ where: { error: { not: null }, createdAt: { gte: new Date(now.getTime() - 24 * HOUR) } } }),
    prisma.webhookEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.channel.findMany({
      where: { status: { in: [ChannelStatus.TOKEN_EXPIRED, ChannelStatus.ERROR] } },
      select: { username: true, name: true, status: true, workspace: { select: { name: true, slug: true } } },
    }),
    prisma.channel.count({ where: { status: ChannelStatus.ACTIVE, tokenExpiresAt: { lte: new Date(now.getTime() + 5 * 24 * HOUR) } } }),
  ]);

  const problems: string[] = [];
  const oldestAgeMs = oldestDue ? now.getTime() - oldestDue.runAt.getTime() : 0;
  if (oldestAgeMs > 2 * MINUTE) problems.push(`Jobs are waiting (${dueJobs} due, oldest ${ago(oldestDue?.runAt)}). Is the worker running?`);
  if (stuck > 0) problems.push(`${stuck} job(s) have been processing for over 15 minutes.`);
  if (webhookErrors > 0) problems.push(`${webhookErrors} webhook event(s) failed in the last 24 hours.`);
  if (reconnect.length > 0) problems.push(`${reconnect.length} account(s) need reconnecting.`);

  console.log("Job queue");
  console.log(`  due now            ${dueJobs}${oldestDue ? ` (oldest ${ago(oldestDue.runAt)}, ${oldestDue.type})` : ""}`);
  console.log(`  processing         ${processing}${stuck ? ` (${stuck} stuck)` : ""}`);
  console.log(`  last finished      ${ago(lastTouched?.updatedAt)}`);
  console.log(`  failed, last 24 h  ${failed24h.length ? failed24h.map((g) => `${g.type} ${g._count._all}`).join(", ") : "none"}`);
  console.log("Webhooks");
  console.log(`  last received      ${ago(lastWebhook?.createdAt)}`);
  console.log(`  errors, last 24 h  ${webhookErrors}`);
  console.log("Accounts");
  console.log(`  need reconnecting  ${reconnect.length}`);
  for (const c of reconnect) console.log(`    ${c.username ? `@${c.username}` : c.name} in ${c.workspace.name} (${c.workspace.slug}): ${c.status}`);
  console.log(`  token expires ≤5 d ${expiringSoon}`);

  console.log(problems.length ? `\nNeeds attention:\n  - ${problems.join("\n  - ")}` : "\nAll clear.");
  process.exitCode = problems.length ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
