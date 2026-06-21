import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

export async function POST(req: Request) {
  try {
    const { itemDetails } = await req.json();

    if (!itemDetails) {
      return NextResponse.json({ error: 'No item details provided' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

    const prompt = `You are the Research Agent for an eBay flipping business. 
    Analyze the following item details extracted by our triage agent: "${itemDetails}". 
    
    Provide a structured market research report containing:
    1. Estimated Average Sold Price (based on current historical trends)
    2. Market Demand & Supply analysis (Active vs. Sold comps ratio)
    3. Estimated Sell-Through Rate (expressed as a percentage or tier: High/Med/Low)
    4. Target Pricing Strategy:
       - Price Floor (Fast liquidity price)
       - Price Ceiling (Maximum optimized margin price)
       
    Be analytical, precise, and highly concise. Do not include introductory fluff.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ result: text });
  } catch (error) {
    console.error('Research API Route Error:', error);
    return NextResponse.json({ error: 'Failed to process research request' }, { status: 500 });
  }
}