import type { Job, JobType } from "@prisma/client";
import { handleBroadcastSend } from "./broadcast-send";
import { handleExecuteFlow } from "./execute-flow";
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
};
