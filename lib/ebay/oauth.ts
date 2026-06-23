import { db } from '@/lib/db';

const EBAY_SANDBOX_BASE = 'https://auth.sandbox.ebay.com/oauth2/authorize';
const EBAY_PROD_BASE = 'https://auth.ebay.com/oauth2/authorize';
const EBAY_SANDBOX_TOKEN = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';
const EBAY_PROD_TOKEN = 'https://api.ebay.com/identity/v1/oauth2/token';

const DEFAULT_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
];

function getEnv() {
  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  const runame = process.env.EBAY_RUNAME;
  const sandbox = (process.env.EBAY_SANDBOX ?? 'true').toLowerCase() === 'true';

  if (!appId || !certId || !runame) {
    throw new Error('Missing eBay env vars: EBAY_APP_ID, EBAY_CERT_ID, EBAY_RUNAME');
  }

  return { appId, certId, runame, sandbox };
}

export function buildEbayAuthUrl(state: string) {
  const { appId, runame, sandbox } = getEnv();
  const base = sandbox ? EBAY_SANDBOX_BASE : EBAY_PROD_BASE;
  const scopes = encodeURIComponent(DEFAULT_SCOPES.join(' '));

  return `${base}?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(runame)}&response_type=code&scope=${scopes}&state=${encodeURIComponent(state)}`;
}

export async function exchangeEbayCode(userId: string, code: string) {
  const { appId, certId, sandbox } = getEnv();
  const tokenUrl = sandbox ? EBAY_SANDBOX_TOKEN : EBAY_PROD_TOKEN;

  const creds = Buffer.from(`${appId}:${certId}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.EBAY_RUNAME as string,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`eBay token exchange failed: ${JSON.stringify(data)}`);
  }

  const expiresIn = Number(data.expires_in ?? 7200);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await db.ebayToken.upsert({
    where: { userId },
    create: {
      userId,
      environment: sandbox ? 'sandbox' : 'production',
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? '',
      expiresAt,
      scope: data.scope,
    },
    update: {
      environment: sandbox ? 'sandbox' : 'production',
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? '',
      expiresAt,
      scope: data.scope,
    },
  });

  return {
    environment: sandbox ? 'sandbox' : 'production',
    expiresAt,
    scope: data.scope,
  };
}

export async function getEbayAccessToken(userId: string): Promise<{ token: string; environment: 'sandbox' | 'production' }> {
  const record = await db.ebayToken.findUnique({ where: { userId } });
  if (!record) {
    throw new Error('eBay is not connected for this user.');
  }

  const env = record.environment === 'production' ? 'production' : 'sandbox';
  return { token: record.accessToken, environment: env };
}

export function ebayApiBase(environment: 'sandbox' | 'production') {
  return environment === 'production' ? 'https://api.ebay.com' : 'https://api.sandbox.ebay.com';
}

export async function ebayRequest<T>(
  userId: string,
  endpoint: string,
  init: RequestInit = {}
): Promise<T> {
  const { token, environment } = await getEbayAccessToken(userId);
  const base = ebayApiBase(environment);
  const res = await fetch(`${base}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`eBay API ${res.status}: ${JSON.stringify(data)}`);
  }

  return data as T;
}
