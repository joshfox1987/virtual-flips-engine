import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const schema = z.object({
  jobId: z.string().min(1),
  status: z.enum(['COMPLETED', 'FAILED']).default('COMPLETED'),
  result: z.any().optional(),
  error: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }

    const existing = await db.job.findUnique({ where: { id: parsed.data.jobId } });
    if (!existing) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }

    const job = await db.job.update({
      where: { id: parsed.data.jobId },
      data: {
        status: parsed.data.status,
        result: (parsed.data.result ?? null) as never,
        error: parsed.data.error,
      },
    });

    return NextResponse.json({ ok: true, job });
  } catch (error) {
    console.error('Jobs complete route error:', error);
    return NextResponse.json({ error: 'Failed to complete job.' }, { status: 500 });
  }
}
