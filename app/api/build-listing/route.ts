import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callOpenRouter } from '@/lib/ai/openrouter';
import { queueBudgetRetry } from '@/lib/jobs/budget';

const schema = z.object({
  userId: z.string().optional(),
  itemId: z.string().optional(),
  triageReport: z.string().min(1),
  marketIntelligence: z.string().min(1),
});

const outputSchema = z.object({
  title: z.string().max(80),
  description: z.string(),
  itemSpecifics: z.record(z.string(), z.string()),
  shippingEstimate: z.object({
    l: z.number(),
    w: z.number(),
    h: z.number(),
    weight: z.string(),
  }),
  categoryId: z.string(),
  returnRisk: z.enum(['Low', 'Medium', 'High']),
  pricingFloor: z.number(),
  visualHash: z.string().optional(),
  confidence: z.number().min(0).max(1),
  notes: z.array(z.string()).optional(),
});

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.\-]/g, '');
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  if (value && typeof value === 'object') {
    const nested = (value as Record<string, unknown>).value ?? (value as Record<string, unknown>).amount;
    return toNumber(nested, fallback);
  }
  return fallback;
}

function normalizeBuildOutput(input: unknown) {
  const src = (input && typeof input === 'object') ? input as Record<string, unknown> : {};

  const rawShipping = (src.shippingEstimate && typeof src.shippingEstimate === 'object')
    ? src.shippingEstimate as Record<string, unknown>
    : {};

  const rawNotes = src.notes;
  const notes = Array.isArray(rawNotes)
    ? rawNotes.map(String)
    : typeof rawNotes === 'string'
    ? [rawNotes]
    : [];

  const normalized = {
    title: String(src.title ?? '').slice(0, 80),
    description: String(src.description ?? ''),
    itemSpecifics: (src.itemSpecifics && typeof src.itemSpecifics === 'object')
      ? Object.fromEntries(Object.entries(src.itemSpecifics as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]))
      : {},
    shippingEstimate: {
      l: toNumber(rawShipping.l, 12),
      w: toNumber(rawShipping.w, 9),
      h: toNumber(rawShipping.h, 6),
      weight: String(rawShipping.weight ?? '1-2 lbs'),
    },
    categoryId: String(src.categoryId ?? ''),
    returnRisk: src.returnRisk === 'High' || src.returnRisk === 'Medium' || src.returnRisk === 'Low'
      ? src.returnRisk
      : 'Low',
    pricingFloor: toNumber(src.pricingFloor, 0),
    visualHash: typeof src.visualHash === 'string' ? src.visualHash : undefined,
    confidence: Math.max(0, Math.min(1, toNumber(src.confidence, 0.65))),
    notes,
  };

  return normalized;
}

export async function POST(req: Request) {
  let retryPayload: z.infer<typeof schema> | null = null;
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }
    retryPayload = parsed.data;

    const model = process.env.OPENROUTER_LISTING_MODEL ?? 'anthropic/claude-sonnet-4-5';

    const response = await callOpenRouter([
      {
        role: 'system',
        content: 'You are an elite eBay listing builder. Output only valid JSON matching the required schema.',
      },
      {
        role: 'user',
        content: `Build an optimized eBay listing draft from the following data.\n\nTriage report:\n${retryPayload.triageReport}\n\nMarket intelligence:\n${retryPayload.marketIntelligence}\n\nRequirements:\n- title max 80 chars, keyword-dense, no fluff\n- fill all itemSpecifics fields if inferable\n- shippingEstimate in inches\n- pricingFloor must be realistic and conservative\n- include confidence (0-1)\n\nReturn JSON keys exactly: title, description, itemSpecifics, shippingEstimate, categoryId, returnRisk, pricingFloor, confidence, notes`,
      },
    ], model, { maxTokens: 1200, temperature: 0.15, requireJson: true });

    const clean = response.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const json = clean ? JSON.parse(clean) : {};
    const normalized = normalizeBuildOutput(json);
    const out = outputSchema.safeParse(normalized);
    if (!out.success) {
      return NextResponse.json({ error: 'Invalid model output.', details: out.error.flatten() }, { status: 500 });
    }

    return NextResponse.json({ result: out.data });
  } catch (error) {
    console.error('Build listing API error:', error);
    const status = (error as Error & { status?: number })?.status;
    if (status === 402) {
      await queueBudgetRetry({
        userId: retryPayload?.userId,
        itemId: retryPayload?.itemId,
        type: 'build-listing',
        payload: retryPayload ?? undefined,
        retryAfterSeconds: 120,
      });
      return NextResponse.json(
        {
          error: 'OpenRouter free-tier budget exceeded. Job paused automatically; retry later or switch to a lower-cost model.',
          code: 'FREE_TIER_BUDGET_EXCEEDED',
          retryAfterSeconds: 120,
        },
        { status: 429 }
      );
    }
    if (error instanceof SyntaxError) {
      // Deterministic fallback when model emits malformed JSON under free-tier constraints.
      return NextResponse.json({
        result: {
          title: 'Untitled Item Listing',
          description: 'AI output could not be parsed. Please regenerate with additional item details.',
          itemSpecifics: {},
          shippingEstimate: { l: 12, w: 9, h: 6, weight: '1-2 lbs' },
          categoryId: '',
          returnRisk: 'Low',
          pricingFloor: 0,
          confidence: 0.25,
          notes: ['Fallback draft generated due to malformed model output.'],
        },
      });
    }
    return NextResponse.json({ error: 'Failed to build listing.' }, { status: 500 });
  }
}
