import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ebayRequest } from '@/lib/ebay/oauth';

const schema = z.object({
  userId: z.string().min(1),
  sku: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  categoryId: z.string().min(1),
  pricingFloor: z.number().positive(),
  quantity: z.number().int().positive().default(1),
  imageUrls: z.array(z.string().url()).default([]),
  condition: z.string().default('NEW'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }

    const {
      userId,
      sku,
      title,
      description,
      categoryId,
      pricingFloor,
      quantity,
      imageUrls,
      condition,
    } = parsed.data;

    // 1) Create/replace inventory item.
    await ebayRequest(userId, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
      method: 'PUT',
      body: JSON.stringify({
        sku,
        condition,
        product: {
          title,
          description,
          imageUrls,
        },
        availability: {
          shipToLocationAvailability: { quantity },
        },
      }),
    });

    // 2) Create offer as draft-like (unpublished) offer.
    const offer = await ebayRequest<{ offerId: string }>(userId, '/sell/inventory/v1/offer', {
      method: 'POST',
      body: JSON.stringify({
        sku,
        marketplaceId: 'EBAY_US',
        format: 'FIXED_PRICE',
        availableQuantity: quantity,
        categoryId,
        listingDescription: description,
        pricingSummary: {
          price: {
            value: pricingFloor.toFixed(2),
            currency: 'USD',
          },
        },
      }),
    });

    return NextResponse.json({ ok: true, offerId: offer.offerId, sku });
  } catch (error) {
    console.error('eBay create-draft route error:', error);
    return NextResponse.json({ error: 'Failed to create eBay draft offer.' }, { status: 500 });
  }
}
