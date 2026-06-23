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
  imageUrl: z.string().url(),
});

export async function POST(req: Request) {
  const tempFiles: string[] = [];
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }

    const { itemId, imageUrl } = parsed.data;
    const sourceRes = await fetch(imageUrl);
    if (!sourceRes.ok) {
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

    const image = await db.image.create({
      data: {
        itemId,
        blobUrl: blob.url,
        variant: 'enhanced',
      },
    });

    return NextResponse.json({ image, url: blob.url });
  } catch (error) {
    console.error('Enhance API error:', error);
    return NextResponse.json({ error: 'Enhancement failed. Ensure Python + Pillow are installed.' }, { status: 500 });
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
