import type { Job } from "@prisma/client";
import { sendPublicReply } from "@/lib/automation/public-reply";

export function handlePublicReply(job: Job): Promise<void> {
  return sendPublicReply(job);
}
