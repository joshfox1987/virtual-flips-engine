import { NextResponse } from 'next/server';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { uploadImageToBlob } from '@/lib/blob';
import { db } from '@/lib/db';

const execFileAsync = promisify(execFile);

const schema = z.object({
  itemId: z.string().min(1),
  imageUrl: z.string().min(1),
});

export async function POST(req: Request) {
  const tempFiles: string[] = [];
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      console.error('Enhance: validation failed', JSON.stringify(parsed.error.issues), 'body keys:', Object.keys(body ?? {}));
      return NextResponse.json({ error: 'Invalid payload.', details: parsed.error.issues }, { status: 400 });
    }

    const { itemId, imageUrl } = parsed.data;
    
    // Handle Vercel private blob URLs by removing the download parameter for proper fetch
    const cleanUrl = imageUrl.replace('?download=1', '');
    
    // Re-encode any unencoded characters (e.g. spaces from filenames) that fetch() would reject
    const fetchUrl = (() => {
      try {
        new URL(cleanUrl);
        return cleanUrl; // already valid
      } catch {
        // Try encoding just the path portion
        const q = cleanUrl.indexOf('?');
        const base = q >= 0 ? cleanUrl.slice(0, q) : cleanUrl;
        const query = q >= 0 ? cleanUrl.slice(q) : '';
        return encodeURI(base) + query;
      }
    })();

    const sourceRes = await fetch(fetchUrl);
    if (!sourceRes.ok) {
      console.error('Enhance: failed to fetch source image from', fetchUrl, 'status:', sourceRes.status);
      return NextResponse.json({ error: 'Failed to fetch source image.' }, { status: 400 });
    }

    const inputPath = path.join(os.tmpdir(), `vf-${Date.now()}-in.jpg`);
    const outputPath = path.join(os.tmpdir(), `vf-${Date.now()}-out.jpg`);
    tempFiles.push(inputPath, outputPath);

    const sourceBuffer = Buffer.from(await sourceRes.arrayBuffer());
    await fs.writeFile(inputPath, sourceBuffer);

    const scriptPath = path.join(process.cwd(), 'tools', 'image_enhance.py');

    // Try python launcher first on Windows, then fallback to python.
    try {
      await execFileAsync('py', ['-3', scriptPath, inputPath, outputPath], { timeout: 30000 });
    } catch {
      await execFileAsync('python', [scriptPath, inputPath, outputPath], { timeout: 30000 });
    }

    const enhancedBuffer = await fs.readFile(outputPath);
    const blobPath = `items/${itemId}/${Date.now()}-enhanced.jpg`;
    const blob = await uploadImageToBlob(blobPath, enhancedBuffer, 'image/jpeg');

    const blobUrl = 'downloadUrl' in blob && typeof blob.downloadUrl === 'string'
      ? blob.downloadUrl
      : blob.url;

    const image = await db.image.create({
      data: {
        itemId,
        blobUrl,
        variant: 'enhanced',
      },
    });

    return NextResponse.json({ image, url: blobUrl });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Enhance API error:', msg);
    return NextResponse.json({ error: 'Enhancement failed. ' + msg }, { status: 500 });
  } finally {
    await Promise.all(tempFiles.map(async file => {
      try {
        await fs.unlink(file);
      } catch {
        // Ignore cleanup failures.
      }
    }));
  }
}
