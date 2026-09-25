import type { Job } from "@prisma/client";
import { fanOutBroadcast } from "@/lib/services/broadcasts";

export async function handleBroadcastFanout(job: Job): Promise<void> {
  await fanOutBroadcast(job);
}
