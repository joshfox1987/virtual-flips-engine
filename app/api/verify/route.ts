import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callOpenRouter } from '@/lib/ai/openrouter';
import { queueBudgetRetry } from '@/lib/jobs/budget';

const schema = z.object({
  userId: z.string().optional(),
  itemId: z.string().optional(),
  triageReport: z.string().min(1),
  marketIntelligence: z.string().min(1),
  listingDraft: z.object({
    title: z.string(),
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
    visualHash: z.string(),
  }),
});

const outputSchema = z.object({
  pass: z.boolean(),
  score: z.number().min(0).max(100),
  issues: z.array(z.string()),
  fixes: z.array(z.string()),
});

export async function POST(req: Request) {
  let retryPayload: z.infer<typeof schema> | null = null;
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }
    retryPayload = parsed.data;

    const model = process.env.OPENROUTER_VERIFY_MODEL ?? 'anthropic/claude-sonnet-4-5';

    const response = await callOpenRouter([
      {
        role: 'system',
        content: 'You are a strict adversarial verifier. Detect hallucinations, unsupported claims, weak pricing logic, and missing required specifics. Return only JSON.',
      },
      {
        role: 'user',
        content: `Verify this listing draft against triage and market evidence.\n\nTriage:\n${retryPayload.triageReport}\n\nMarket:\n${retryPayload.marketIntelligence}\n\nListing draft:\n${JSON.stringify(retryPayload.listingDraft, null, 2)}\n\nReturn JSON keys: pass (bool), score (0-100), issues (string[]), fixes (string[]).`,
      },
    ], model, { maxTokens: 900, temperature: 0.1, requireJson: true });

    const clean = response.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const json = JSON.parse(clean);
    const out = outputSchema.safeParse(json);
    if (!out.success) {
      return NextResponse.json({ error: 'Invalid model output.', details: out.error.flatten() }, { status: 500 });
    }

    return NextResponse.json({ result: out.data });
  } catch (error) {
    console.error('Verify API error:', error);
    const status = (error as Error & { status?: number })?.status;
    if (status === 402) {
      await queueBudgetRetry({
        userId: retryPayload?.userId,
        itemId: retryPayload?.itemId,
        type: 'verify-listing',
        payload: retryPayload ?? undefined,
        retryAfterSeconds: 120,
      });
      return NextResponse.json(
        {
          error: 'OpenRouter free-tier budget exceeded. Verification paused automatically; retry later or lower model cost.',
          code: 'FREE_TIER_BUDGET_EXCEEDED',
          retryAfterSeconds: 120,
        },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: 'Failed to verify listing.' }, { status: 500 });
  }
}
