import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ebayRequest } from '@/lib/ebay/oauth';

const schema = z.object({
  userId: z.string().min(1),
  offerId: z.string().min(1),
  price: z.number().positive(),
  currency: z.string().default('USD'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }

    const { userId, offerId, price, currency } = parsed.data;

    const currentOffer = await ebayRequest<Record<string, unknown>>(
      userId,
      `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
      { method: 'GET' }
    );

    await ebayRequest(userId, `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...currentOffer,
        pricingSummary: {
          price: {
            value: price.toFixed(2),
            currency,
          },
        },
      }),
    });

    return NextResponse.json({ ok: true, offerId, price, currency });
  } catch (error) {
    console.error('eBay update-price route error:', error);
    return NextResponse.json({ error: 'Failed to update eBay offer price.' }, { status: 500 });
  }
}
