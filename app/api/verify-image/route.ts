import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

const schema = z.object({
  originalUrl: z.string().url(),
  enhancedUrl: z.string().url(),
});

async function toInlineData(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get('content-type') ?? 'image/jpeg';
    const data = Buffer.from(await res.arrayBuffer()).toString('base64');
    return { data, mimeType };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }

    const original = await toInlineData(parsed.data.originalUrl);
    const enhanced = await toInlineData(parsed.data.enhancedUrl);
    if (!original || !enhanced) {
      return NextResponse.json({ error: 'Failed to load images for verification.' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const prompt = `Compare image A (original) and image B (enhanced). Determine whether B is a faithful professional enhancement of A.
Rules:
- Same item identity and shape must be preserved.
- No fabricated or removed product details.
- Lighting, contrast, and clarity improvements are allowed.
Return ONLY JSON with keys: approved (boolean), confidence (0-1), notes (string[]).`;

    const result = await model.generateContent([
      prompt,
      { inlineData: original },
      { inlineData: enhanced },
    ]);

    const text = result.response.text().trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
    const json = JSON.parse(text);
    return NextResponse.json({ result: json });
  } catch (error) {
    console.error('Verify image API error:', error);
    return NextResponse.json({ error: 'Failed to verify enhanced image.' }, { status: 500 });
  }
}
