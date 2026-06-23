import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ebayRequest } from '@/lib/ebay/oauth';

const querySchema = z.object({
  userId: z.string().min(1),
  sku: z.string().min(1),
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      userId: searchParams.get('userId'),
      sku: searchParams.get('sku'),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Missing userId or sku.' }, { status: 400 });
    }

    const { userId, sku } = parsed.data;
    const result = await ebayRequest<Record<string, unknown>>(
      userId,
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      { method: 'GET' }
    );

    // Inventory API does not expose rich watcher/view metrics directly in one call.
    // Return currently available telemetry-ish data for now.
    return NextResponse.json({
      ok: true,
      sku,
      availability: result['availability'] ?? null,
      condition: result['condition'] ?? null,
      packageWeightAndSize: result['packageWeightAndSize'] ?? null,
    });
  } catch (error) {
    console.error('eBay telemetry route error:', error);
    return NextResponse.json({ error: 'Failed to fetch telemetry.' }, { status: 500 });
  }
}
