import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ebayRequest } from '@/lib/ebay/oauth';

const schema = z.object({
  userId: z.string().min(1),
  offerId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }

    const { userId, offerId } = parsed.data;
    const result = await ebayRequest<{ listingId: string }>(
      userId,
      `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
      { method: 'POST' }
    );

    return NextResponse.json({ ok: true, listingId: result.listingId, offerId });
  } catch (error) {
    console.error('eBay publish route error:', error);
    return NextResponse.json({ error: 'Failed to publish eBay offer.' }, { status: 500 });
  }
}
