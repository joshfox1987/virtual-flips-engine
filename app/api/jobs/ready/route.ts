import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const querySchema = z.object({
  userId: z.string().min(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      userId: searchParams.get('userId'),
      limit: searchParams.get('limit') ?? 10,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query.' }, { status: 400 });
    }

    const jobs = await db.job.findMany({
      where: {
        userId: parsed.data.userId,
        status: { in: ['QUEUED', 'PAUSED'] },
        runAt: { lte: new Date() },
      },
      orderBy: [
        { priority: 'asc' },
        { runAt: 'asc' },
        { createdAt: 'asc' },
      ],
      take: parsed.data.limit,
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('Jobs ready route error:', error);
    return NextResponse.json({ error: 'Failed to fetch ready jobs.' }, { status: 500 });
  }
}
