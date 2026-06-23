import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const listingTitle: string = body.listingTitle ?? '';
    const description: string = body.description ?? '';
    const price: number = body.price ?? 0;

    if (!listingTitle.trim()) {
      return NextResponse.json({ error: 'No listing title provided.' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

    const prompt = `You are an expert organic social media marketer for eBay resellers.
Generate high-converting, zero-cost advertisement copy for the following eBay listing.

Listing Title: ${listingTitle}
Description: ${description}
Price: $${price}

Output two distinct sections using markdown:

### Facebook Group Post
Write a compelling, casual post optimized for eBay resale Facebook groups and local selling groups. 
Include: attention-grabbing opener, key selling points, price anchoring, urgency trigger, and a call-to-action with placeholder "[EBAY LINK HERE]".
Keep it under 150 words.

### Facebook Marketplace Ad
Write a tight, punchy Marketplace listing description. Focus on condition, value, and a direct CTA.
Keep it under 80 words.

### Paste Coordinates
Provide a short 2-3 bullet list of the best Facebook groups/Marketplace categories to paste each ad into, based on the item type.

Use markdown formatting throughout. Keep tone energetic but credible — no all-caps spam tactics.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return NextResponse.json({ result: text });
  } catch (error) {
    console.error('Social API Error:', error);
    return NextResponse.json({ error: 'Failed to generate social copy.' }, { status: 500 });
  }
}
