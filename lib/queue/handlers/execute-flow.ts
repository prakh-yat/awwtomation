import type { Job } from "@prisma/client";
import { executeFlowStep } from "@/lib/automation/engine";

export function handleExecuteFlow(job: Job): Promise<void> {
  return executeFlowStep(job);
}
