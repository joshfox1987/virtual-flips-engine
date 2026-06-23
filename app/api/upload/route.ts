import { NextResponse } from 'next/server';
import { z } from 'zod';
import { uploadImageToBlob } from '@/lib/blob';
import { db } from '@/lib/db';

const uploadSchema = z.object({
  itemId: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  dataUrl: z.string().min(1),
  variant: z.string().optional(),
});

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = uploadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid upload payload.' }, { status: 400 });
    }

    const { itemId, filename, contentType, dataUrl, variant } = parsed.data;
    const parsedData = parseDataUrl(dataUrl);
    if (!parsedData) {
      return NextResponse.json({ error: 'Invalid data URL.' }, { status: 400 });
    }

    const buffer = Buffer.from(parsedData.base64, 'base64');
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `items/${itemId}/${Date.now()}-${safeName}`;

    const blob = await uploadImageToBlob(path, buffer, contentType || parsedData.mimeType);
    const blobUrl = 'downloadUrl' in blob && typeof blob.downloadUrl === 'string'
      ? blob.downloadUrl
      : blob.url;

    const image = await db.image.create({
      data: {
        itemId,
        blobUrl,
        variant: variant ?? 'original',
      },
    });

    return NextResponse.json({ image, url: blobUrl });
  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json({ error: 'Failed to upload image.' }, { status: 500 });
  }
}
