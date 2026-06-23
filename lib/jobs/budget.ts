import { db } from '@/lib/db';

export async function queueBudgetRetry(params: {
  userId?: string;
  itemId?: string;
  type: string;
  payload?: unknown;
  retryAfterSeconds?: number;
}) {
  const retryAfterSeconds = Math.max(30, Math.min(params.retryAfterSeconds ?? 120, 1800));
  const runAt = new Date(Date.now() + retryAfterSeconds * 1000);

  if (!params.userId) {
    return null;
  }

  return db.job.create({
    data: {
      userId: params.userId,
      itemId: params.itemId,
      type: params.type,
      status: 'PAUSED',
      payload: (params.payload ?? null) as never,
      runAt,
      attempts: 0,
    },
  });
}
