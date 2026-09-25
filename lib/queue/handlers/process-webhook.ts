import type { Job } from "@prisma/client";
import { processWebhookJob } from "@/lib/webhooks/processor";

export async function handleProcessWebhook(job: Job): Promise<void> {
  await processWebhookJob(job);
}
