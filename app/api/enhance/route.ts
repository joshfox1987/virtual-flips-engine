import { NextResponse } from 'next/server';
import { z } from 'zod';
import sharp from 'sharp';
import { uploadImageToBlob } from '@/lib/blob';
import { db } from '@/lib/db';

const schema = z.object({
  itemId: z.string().min(1),
  imageUrl: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      console.error('Enhance: validation failed', JSON.stringify(parsed.error.issues));
      return NextResponse.json({ error: 'Invalid payload.', details: parsed.error.issues }, { status: 400 });
    }

    const { itemId, imageUrl } = parsed.data;

    // Fetch source image — keep URL as-is so private blob ?download=1 auth token is preserved
    console.log('Enhance: fetching', imageUrl.slice(0, 80));
    const sourceRes = await fetch(imageUrl);
    if (!sourceRes.ok) {
      console.error('Enhance: fetch failed, status:', sourceRes.status);
      return NextResponse.json({ error: `Failed to fetch source image (${sourceRes.status}).` }, { status: 400 });
    }

    const sourceBuffer = Buffer.from(await sourceRes.arrayBuffer());
    console.log('Enhance: source fetched, bytes:', sourceBuffer.byteLength);

    // Deterministic enhancement pipeline via sharp (no Python / subprocess dependency)
    const enhancedBuffer = await sharp(sourceBuffer)
      .normalize()                                       // autocontrast
      .modulate({ brightness: 1.03, saturation: 1.06 }) // brightness + colour boost
      .sharpen({ sigma: 1.6, m1: 1.0, m2: 2.0 })       // unsharp mask
      .jpeg({ quality: 95 })
      .toBuffer();

    const blobPath = `items/${itemId}/${Date.now()}-enhanced.jpg`;
    const blob = await uploadImageToBlob(blobPath, enhancedBuffer, 'image/jpeg');

    const blobUrl = 'downloadUrl' in blob && typeof blob.downloadUrl === 'string'
      ? blob.downloadUrl
      : blob.url;

    const image = await db.image.create({
      data: { itemId, blobUrl, variant: 'enhanced' },
    });

    console.log('Enhance: success');
    return NextResponse.json({ image, url: blobUrl });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Enhance API error:', msg);
    return NextResponse.json({ error: 'Enhancement failed. ' + msg }, { status: 500 });
  }
}
