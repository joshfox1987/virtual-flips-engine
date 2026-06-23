import { NextResponse } from 'next/server';
import { z } from 'zod';
import { exchangeEbayCode } from '@/lib/ebay/oauth';

const schema = z.object({
  userId: z.string().min(1),
  code: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }

    const token = await exchangeEbayCode(parsed.data.userId, parsed.data.code);
    return NextResponse.json({ ok: true, token });
  } catch (error) {
    console.error('eBay exchange route error:', error);
    return NextResponse.json({ error: 'Failed to exchange eBay auth code.' }, { status: 500 });
  }
}
