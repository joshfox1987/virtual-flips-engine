import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

interface DraftPayload {
  title?: string;
  description?: string;
  pricingFloor?: number;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const draft: DraftPayload = body.draft ?? {};
    const instruction: string = body.instruction ?? '';

    if (!instruction.trim()) {
      return NextResponse.json({ error: 'No instruction provided.' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

    const prompt = `You are an eBay listing editor. You will receive a listing draft and a plain-English revision instruction.
Apply the instruction precisely and return ONLY a valid JSON object with the fields that changed.

Current draft:
- Title: ${draft.title ?? '(none)'}
- Description: ${draft.description ?? '(none)'}
- Pricing Floor: $${draft.pricingFloor ?? 0}

Revision instruction: "${instruction}"

Return a JSON object containing only the fields that were modified. Valid keys: "title", "description", "pricingFloor".
Also include a "summary" key with a one-sentence plain English summary of what you changed.

Example response:
{"title": "Updated title here", "summary": "Updated the title to include the model number."}

Return ONLY the JSON object. No markdown, no code fences.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Strip any accidental markdown code fences
    const clean = text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return NextResponse.json(
        { error: 'Model returned non-JSON response.', raw: text },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Revise API Error:', error);
    return NextResponse.json({ error: 'Failed to process revision.' }, { status: 500 });
  }
}
