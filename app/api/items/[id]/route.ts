import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const updateItemSchema = z.object({
  title: z.string().optional(),
  stage: z.enum(['UPLOAD', 'TRIAGE', 'RESEARCH', 'BUILD', 'VERIFY', 'DRAFT', 'ACTIVE']).optional(),
  triageReport: z.string().nullable().optional(),
  marketIntelligence: z.string().nullable().optional(),
  listingDraft: z.any().optional(),
  verification: z.any().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const item = await db.item.findUnique({
      where: { id },
      include: {
        images: true,
        jobs: { orderBy: { createdAt: 'desc' } },
        chatMessages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error('Item GET error:', error);
    return NextResponse.json({ error: 'Failed to load item.' }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const parsed = updateItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }

    const item = await db.item.update({
      where: { id },
      data: parsed.data,
      include: { images: true, jobs: true },
    });

    return NextResponse.json({ item });
  } catch (error) {
    console.error('Item PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update item.' }, { status: 500 });
  }
}
