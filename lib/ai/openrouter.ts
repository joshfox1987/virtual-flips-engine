export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterOptions {
  maxTokens?: number;
  temperature?: number;
  requireJson?: boolean;
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  model: string,
  options: OpenRouterOptions = {}
) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is missing.');
  }

  const maxTokens = Math.max(256, Math.min(options.maxTokens ?? 1200, 4000));
  const temperature = options.temperature ?? 0.2;
  const requireJson = options.requireJson ?? true;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Virtual Flips Engine',
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages,
      ...(requireJson ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`OpenRouter error ${res.status}: ${text}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('Invalid OpenRouter response.');
  }

  return content;
}
