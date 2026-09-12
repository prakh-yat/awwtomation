import type { Job } from "@prisma/client";
import { reconcileChannel } from "@/lib/automation/reconcile";

export function handleReconcileComments(job: Job): Promise<void> {
  return reconcileChannel(job);
}
