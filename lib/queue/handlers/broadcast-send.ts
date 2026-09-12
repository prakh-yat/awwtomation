import type { Job } from "@prisma/client";
import { sendBroadcastMessage } from "@/lib/services/broadcasts";

/** Payload shape is owned by lib/services/broadcasts (the broadcasts lane). */
export function handleBroadcastSend(job: Job): Promise<void> {
  return sendBroadcastMessage(job);
}
