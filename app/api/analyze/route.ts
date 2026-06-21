import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

export async function POST(req: Request) {
  try {
    const { image } = await req.json();

    // Strip the base64 prefix from the image string
    const base64Data = image.split(',')[1];

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

    const prompt = "You are the Triage Agent for an eBay flipping business. Look at this image. Identify the item, the brand, the likely model, and assess its physical condition based on visual evidence. Be concise.";

    const imageParts = [
      {
        inlineData: {
          data: base64Data,
          mimeType: 'image/jpeg'
        }
      }
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ result: text });
  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json({ error: 'Failed to process triage request' }, { status: 500 });
  }
}