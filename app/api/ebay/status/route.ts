import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const query = z.object({ userId: z.string().min(1) });

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = query.safeParse({ userId: searchParams.get('userId') });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Missing userId.' }, { status: 400 });
    }

    const token = await db.ebayToken.findUnique({ where: { userId: parsed.data.userId } });
    if (!token) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
      connected: true,
      environment: token.environment,
      expiresAt: token.expiresAt,
      hasRefreshToken: Boolean(token.refreshToken),
      scope: token.scope,
    });
  } catch (error) {
    console.error('eBay status route error:', error);
    return NextResponse.json({ error: 'Failed to get eBay status.' }, { status: 500 });
  }
}
