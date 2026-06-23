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

    try {
      // End listing by withdrawing offer when currently live.
      await ebayRequest(userId, `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/withdraw`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'OTHER' }),
      });
    } catch {
      // Continue to publish attempt in case offer is already ended.
    }

    // Re-publish same offer as relist workaround.
    const result = await ebayRequest<{ listingId: string }>(
      userId,
      `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
      { method: 'POST' }
    );

    return NextResponse.json({ ok: true, listingId: result.listingId, offerId });
  } catch (error) {
    console.error('eBay relist route error:', error);
    return NextResponse.json({ error: 'Failed to relist eBay offer.' }, { status: 500 });
  }
}
