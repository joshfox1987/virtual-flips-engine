import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

// Extracts the raw base64 data and sniffs the mime type from a data URL.
// Falls back to image/jpeg for raw base64 strings.
function parseImageDataUrl(dataUrl: string): { data: string; mimeType: string } {
  const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  // Raw base64 without a data URL prefix
  return { mimeType: 'image/jpeg', data: dataUrl };
}

async function imageUrlToInlineData(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    // Handle Vercel private blob URLs by removing the download parameter
    const cleanUrl = url.replace('?download=1', '');
    const res = await fetch(cleanUrl);
    if (!res.ok) {
      console.warn('imageUrlToInlineData: fetch failed for', cleanUrl, 'status:', res.status);
      return null;
    }
    const buffer = await res.arrayBuffer();
    const mimeType = res.headers.get('content-type') ?? 'image/jpeg';
    const data = Buffer.from(buffer).toString('base64');
    return { data, mimeType };
  } catch (error) {
    console.warn('imageUrlToInlineData: error fetching', url, error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Accept both { images: string[] } (new multi-image) and { image: string } (legacy single)
    const rawImages: string[] = body.images
      ? body.images.slice(0, 24)
      : body.image
      ? [body.image]
      : [];

    if (rawImages.length === 0) {
      return NextResponse.json({ error: 'No images provided.' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

    const prompt = `You are the Triage Agent for a high-volume eBay flipping business.
You have been given ${rawImages.length} image(s) of an item.

Your tasks:
1. **Item Identification:** Name the item, brand, model, and approximate manufacture year if determinable.
2. **Condition Assessment:** Assess physical condition (Mint, Excellent, Good, Fair, Poor) with specific visual evidence.
3. **Unique Identifiers:** Note any serial numbers, labels, stamps, or markings visible.
4. **Missing Angles:** If critical angles are missing (e.g., back panel, connector ports, labels), list them explicitly as: "⚠ Missing angle: [description]" — these are instructions for the seller to photograph.
5. **Material & Weight Estimate:** Best estimate based on visual cues.

Be concise. Use markdown headers and bullet points.`;

    const imageParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];
    for (const raw of rawImages) {
      if (raw.startsWith('http://') || raw.startsWith('https://')) {
        const inlineData = await imageUrlToInlineData(raw);
        if (inlineData) {
          imageParts.push({ inlineData });
        }
      } else {
        const { data, mimeType } = parseImageDataUrl(raw);
        imageParts.push({ inlineData: { data, mimeType } });
      }
    }

    if (imageParts.length === 0) {
      console.warn('Analyze: no valid images after processing', rawImages.length, 'input(s)');
      return NextResponse.json({ error: 'No valid images could be processed. Check image URLs.' }, { status: 400 });
    }

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ result: text });
  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json({ error: 'Failed to process triage request' }, { status: 500 });
  }
}