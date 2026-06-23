import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildEbayAuthUrl } from '@/lib/ebay/oauth';

const schema = z.object({
  userId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }

    const state = Buffer.from(JSON.stringify({ userId: parsed.data.userId, ts: Date.now() })).toString('base64url');
    const authUrl = buildEbayAuthUrl(state);

    return NextResponse.json({ authUrl, state });
  } catch (error) {
    console.error('eBay auth route error:', error);
    return NextResponse.json({ error: 'Failed to generate eBay auth URL.' }, { status: 500 });
  }
}
