import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ebayRequest } from '@/lib/ebay/oauth';

const schema = z.object({
  userId: z.string().min(1),
  force: z.boolean().optional().default(false),
});

type ActiveListing = {
  id: string;
  title: string;
  ebayListingId: string;
  ebayOfferId?: string;
  sku?: string;
  pricingFloor: number;
  views: number;
  watchers: number;
  listedAt: string;
  autoRelistEnabled: boolean;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }

    const { userId, force } = parsed.data;

    const items = await db.item.findMany({
      where: {
        userId,
        stage: 'ACTIVE',
      },
      select: {
        id: true,
        verification: true,
      },
    });

    let processed = 0;
    let relisted = 0;
    const errors: string[] = [];

    for (const item of items) {
      const verification = (item.verification ?? {}) as Record<string, unknown>;
      const activeListings = (Array.isArray(verification.activeListings)
        ? verification.activeListings
        : []) as ActiveListing[];

      if (activeListings.length === 0) continue;

      let changed = false;
      const updatedListings: ActiveListing[] = [];

      for (const listing of activeListings) {
        processed += 1;

        const listedAtMs = new Date(listing.listedAt).getTime();
        const ageMs = Number.isFinite(listedAtMs) ? Date.now() - listedAtMs : 0;
        const dueForRelist = force || ageMs >= SEVEN_DAYS_MS;

        if (!listing.autoRelistEnabled || !dueForRelist || !listing.ebayOfferId) {
          updatedListings.push(listing);
          continue;
        }

        try {
          try {
            await ebayRequest(userId, `/sell/inventory/v1/offer/${encodeURIComponent(listing.ebayOfferId)}/withdraw`, {
              method: 'POST',
              body: JSON.stringify({ reason: 'OTHER' }),
            });
          } catch {
            // Already ended is acceptable; continue publish attempt.
          }

          const publish = await ebayRequest<{ listingId: string }>(
            userId,
            `/sell/inventory/v1/offer/${encodeURIComponent(listing.ebayOfferId)}/publish`,
            { method: 'POST' }
          );

          updatedListings.push({
            ...listing,
            ebayListingId: publish.listingId,
            listedAt: new Date().toISOString(),
          });
          relisted += 1;
          changed = true;
        } catch (error) {
          errors.push(
            `Item ${item.id} / Listing ${listing.id}: ${error instanceof Error ? error.message : 'Relist failed.'}`
          );
          updatedListings.push(listing);
        }
      }

      if (changed) {
        await db.item.update({
          where: { id: item.id },
          data: {
            verification: {
              ...verification,
              activeListings: updatedListings,
            } as never,
          },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      relisted,
      errors,
    });
  } catch (error) {
    console.error('eBay auto-relist route error:', error);
    return NextResponse.json({ error: 'Failed to run auto-relist sweep.' }, { status: 500 });
  }
}
