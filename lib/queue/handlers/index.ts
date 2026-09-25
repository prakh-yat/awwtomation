import type { Job, JobType } from "@prisma/client";
import { handleBroadcastFanout } from "./broadcast-fanout";
import { handleBroadcastSend } from "./broadcast-send";
import { handleExecuteFlow } from "./execute-flow";
import { handleProcessWebhook } from "./process-webhook";
import { handlePublicReply } from "./public-reply";
import { handleReconcileComments } from "./reconcile-comments";
import { handleRefreshToken } from "./refresh-token";
import { handleSyncMedia } from "./sync-media";

export type JobHandler = (job: Job) => Promise<void>;

/** One handler per JobType; `processBatch` dispatches through this table. */
export const handlers: Record<JobType, JobHandler> = {
  EXECUTE_FLOW: handleExecuteFlow,
  PUBLIC_REPLY: handlePublicReply,
  BROADCAST_SEND: handleBroadcastSend,
  REFRESH_TOKEN: handleRefreshToken,
  RECONCILE_COMMENTS: handleReconcileComments,
  SYNC_MEDIA: handleSyncMedia,
  PROCESS_WEBHOOK: handleProcessWebhook,
  BROADCAST_FANOUT: handleBroadcastFanout,
};
