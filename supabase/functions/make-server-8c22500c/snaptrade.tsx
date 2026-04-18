/**
 * SnapTrade API integration - uses fetch (Deno-compatible).
 * API docs: https://docs.snaptrade.com/
 */

const BASE = "https://api.snaptrade.com/api/v1";

/**
 * Match SnapTrade TypeScript SDK signature canonicalization.
 * The SDK collects all keys seen during JSON stringify, sorts them, then calls
 * JSON.stringify(obj, allKeys) so object keys are output in a stable order.
 */
function JSONstringifyOrder(obj: any): string {
  const allKeys: string[] = [];
  const seen: Record<string, null> = {};
  JSON.stringify(obj, (key, value) => {
    if (!(key in seen)) {
      allKeys.push(key);
      seen[key] = null;
    }
    return value;
  });
  allKeys.sort();
  return JSON.stringify(obj, allKeys);
}

/** Generate HMAC-SHA256 signature (Deno Web Crypto) */
async function sign(consumerKey: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(consumerKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** Make signed request to SnapTrade API */
async function snaptradeFetch(
  clientId: string,
  consumerKey: string,
  method: string,
  path: string,
  query: Record<string, string> = {},
  body?: object
): Promise<Response> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  // SnapTrade signature verification is sensitive to the *exact* querystring.
  // Follow SnapTrade TypeScript SDK: query begins with `clientId` and `timestamp`,
  // then any endpoint-specific query params (e.g. `userId`, `userSecret`) in insertion order.
  const params = new URLSearchParams();
  params.append("clientId", clientId);
  params.append("timestamp", timestamp);
  for (const [k, v] of Object.entries(query)) {
    params.append(k, v);
  }
  const url = `${BASE}${path}?${params}`;

  // Match SnapTrade TypeScript SDK signing behavior.
  const consumerKeyEncoded = encodeURI(consumerKey);
  const requestData = body === undefined ? null : body;
  const requestPath = `/api/v1${path}`;
  const requestQuery = params.toString(); // no leading "?"
  const sigObject = { content: requestData, path: requestPath, query: requestQuery };
  const sigContent = JSONstringifyOrder(sigObject);
  const signature = await sign(consumerKeyEncoded, sigContent);

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Signature": signature,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

export interface SnapTradeRegisterResponse {
  userId: string;
  userSecret: string;
}

export async function registerSnapTradeUser(
  clientId: string,
  consumerKey: string,
  userId: string
): Promise<SnapTradeRegisterResponse> {
  const res = await snaptradeFetch(clientId, consumerKey, "POST", "/snapTrade/registerUser", {}, { userId });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error || `SnapTrade register failed: ${res.status}`);
  return { userId: data.userId, userSecret: data.userSecret };
}

export interface SnapTradeLoginResponse {
  redirectURI: string;
  sessionId: string;
}

export interface SnapTradeLoginOptions {
  customRedirect?: string;
  connectionType?: "read" | "trade" | "trade-if-available";
}

export async function loginSnapTradeUser(
  clientId: string,
  consumerKey: string,
  userId: string,
  userSecret: string,
  options?: SnapTradeLoginOptions
): Promise<SnapTradeLoginResponse> {
  const query = { userId, userSecret };
  const body = options ? {
    customRedirect: options.customRedirect,
    connectionType: options.connectionType || "read",
  } : undefined;
  const res = await snaptradeFetch(clientId, consumerKey, "POST", "/snapTrade/login", query, body);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error || `SnapTrade login failed: ${res.status}`);
  return { redirectURI: data.redirectURI, sessionId: data.sessionId };
}

export interface SnapTradeAccount {
  id: string;
  name?: string;
  number?: string;
  institution_name?: string;
  meta?: { balance?: number; currency?: string };
  type?: string;
}

export async function listSnapTradeAccounts(
  clientId: string,
  consumerKey: string,
  userId: string,
  userSecret: string
): Promise<SnapTradeAccount[]> {
  const res = await snaptradeFetch(clientId, consumerKey, "GET", "/accounts", { userId, userSecret });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error || `SnapTrade list accounts failed: ${res.status}`);
  const accounts = Array.isArray(data) ? data : data?.accounts || [];
  return accounts.map((a: any) => ({
    id: a.id,
    name: a.name,
    number: a.number,
    institution_name: a.institution_name,
    meta: a.meta,
    type: a.type,
  }));
}

export interface SnapTradeReturnRate {
  timeframe: string;
  return_percent: number;
  created_date: string;
}

export async function getUserAccountReturnRates(
  clientId: string,
  consumerKey: string,
  userId: string,
  userSecret: string,
  accountId: string
): Promise<SnapTradeReturnRate[]> {
  const res = await snaptradeFetch(
    clientId,
    consumerKey,
    "GET",
    `/accounts/${accountId}/returnRates`,
    { userId, userSecret }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `SnapTrade return rates failed: ${res.status}`);
  }
  const items = Array.isArray(data?.data) ? data.data : [];
  return items.map((r: any) => ({
    timeframe: r.timeframe,
    return_percent: r.return_percent,
    created_date: r.created_date,
  }));
}

export interface SnapTradeAccountListItem {
  id: string;
  brokerage_authorization?: string;
  name?: string;
  number?: string;
  institution_name?: string;
  sync_status?: any;
  balance?: any;
  meta?: any;
  created_date?: string;
  updated_date?: string;
}

export async function listUserAccounts(
  clientId: string,
  consumerKey: string,
  userId: string,
  userSecret: string
): Promise<SnapTradeAccountListItem[]> {
  const res = await snaptradeFetch(clientId, consumerKey, "GET", "/accounts", { userId, userSecret });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error || `SnapTrade list accounts failed: ${res.status}`);
  const accounts = Array.isArray(data) ? data : data?.accounts || [];
  return accounts.map((a: any) => ({
    id: a.id,
    brokerage_authorization: a.brokerage_authorization,
    name: a.name,
    number: a.number,
    institution_name: a.institution_name,
    sync_status: a.sync_status,
    balance: a.balance,
    meta: a.meta,
    created_date: a.created_date,
    updated_date: a.updated_date,
  }));
}

export async function getAccountBalances(
  clientId: string,
  consumerKey: string,
  userId: string,
  userSecret: string,
  accountId: string
): Promise<any[]> {
  const res = await snaptradeFetch(
    clientId,
    consumerKey,
    "GET",
    `/accounts/${accountId}/balances`,
    { userId, userSecret }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error || `SnapTrade balances failed: ${res.status}`);
  const items = Array.isArray(data) ? data : data?.balances || data?.data || [];
  return Array.isArray(items) ? items : [];
}

export async function getAccountHoldings(
  clientId: string,
  consumerKey: string,
  userId: string,
  userSecret: string,
  accountId: string
): Promise<any> {
  const res = await snaptradeFetch(
    clientId,
    consumerKey,
    "GET",
    `/accounts/${accountId}/holdings`,
    { userId, userSecret }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error || `SnapTrade holdings failed: ${res.status}`);
  return data;
}

export async function getAccountPositions(
  clientId: string,
  consumerKey: string,
  userId: string,
  userSecret: string,
  accountId: string
): Promise<any[]> {
  const res = await snaptradeFetch(
    clientId,
    consumerKey,
    "GET",
    `/accounts/${accountId}/positions`,
    { userId, userSecret }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error || `SnapTrade positions failed: ${res.status}`);
  const items = Array.isArray(data) ? data : data?.positions || data?.data || [];
  return Array.isArray(items) ? items : [];
}

export async function getAccountActivities(
  clientId: string,
  consumerKey: string,
  userId: string,
  userSecret: string,
  accountId: string,
  limit: number = 20,
  offset: number = 0
): Promise<any> {
  const res = await snaptradeFetch(
    clientId,
    consumerKey,
    "GET",
    `/accounts/${accountId}/activities`,
    {
      userId,
      userSecret,
      limit: String(limit),
      offset: String(offset),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error || `SnapTrade activities failed: ${res.status}`);
  return data;
}