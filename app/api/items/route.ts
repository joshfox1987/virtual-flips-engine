import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const listQuerySchema = z.object({
  userId: z.string().min(1),
});

const createItemSchema = z.object({
  userId: z.string().min(1),
  title: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = listQuerySchema.safeParse({ userId: searchParams.get('userId') });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Missing userId.' }, { status: 400 });
    }

    const items = await db.item.findMany({
      where: { userId: parsed.data.userId },
      include: {
        images: true,
        jobs: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Items GET error:', error);
    return NextResponse.json({ error: 'Failed to load items.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = createItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }

    const item = await db.item.create({
      data: {
        userId: parsed.data.userId,
        title: parsed.data.title,
      },
      include: { images: true, jobs: true },
    });

    return NextResponse.json({ item });
  } catch (error) {
    console.error('Items POST error:', error);
    return NextResponse.json({ error: 'Failed to create item.' }, { status: 500 });
  }
}
