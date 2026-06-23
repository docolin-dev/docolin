// The body of a sync-queue message: which git source to drain. The job state
// itself lives in the sync_jobs row, so the message is just a durable trigger.
// Producer is the main worker (enqueueSync / the drain endpoint / cron reclaim);
// consumer is the docolin-cron worker, which calls /api/sync/drain per message.
export interface SyncQueueMessage {
  gitSourceId: string;
}
