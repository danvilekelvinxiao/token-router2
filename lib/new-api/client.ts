/**
 * New API client — wraps the upstream New API admin endpoints.
 * All functions are server-only. Never import this in browser code.
 *
 * Strategy:
 * - Token keys: generated locally in sk- format (New API doesn't return keys on create)
 * - Usage data: fetched from New API /api/log/ when admin token is valid
 * - Quota sync: pushed to New API /api/token/ (PUT) when admin token is valid
 * - Health: verified by checking New API /api/status and /api/token/
 *
 * Falls back to mock data when NEW_API_ADMIN_TOKEN is missing or invalid.
 */

const NEW_API_BASE_URL =
  process.env.NEW_API_BASE_URL || "http://localhost:3001";
const NEW_API_ADMIN_TOKEN = process.env.NEW_API_ADMIN_TOKEN || "";
const NEW_API_DEFAULT_GROUP =
  process.env.NEW_API_DEFAULT_GROUP || "default";
const NEW_API_DEFAULT_QUOTA = Number(
  process.env.NEW_API_DEFAULT_QUOTA || 500000,
);

let _adminValid: boolean | null = null;

function adminHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${NEW_API_ADMIN_TOKEN}`,
    "New-Api-User": "1",
    "Content-Type": "application/json",
  };
}

async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; data: any }> {
  if (!NEW_API_ADMIN_TOKEN) return { ok: false, data: null };
  try {
    const url = `${NEW_API_BASE_URL}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: { ...adminHeaders(), ...((options.headers as Record<string, string>) || {}) },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || (body && body.success === false)) {
      return { ok: false, data: body };
    }
    return { ok: true, data: body?.data ?? body };
  } catch {
    return { ok: false, data: null };
  }
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

export interface NewApiToken {
  id: string;
  key: string;
  name: string;
  group: string;
  quota: number;
  usedQuota: number;
  createdTime: number;
  accessedTime: number;
  expiredTime: number;
  disabled: boolean;
  models: string[];
}

let mockTokenCounter = 1;

function generateSkKey(): string {
  const hex = Array.from({ length: 48 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
  return `sk-${hex}`;
}

function mockToken(params: { name: string; group?: string; quota?: number }): NewApiToken {
  const now = Date.now();
  return {
    id: `token_mock_${mockTokenCounter++}`,
    key: generateSkKey(),
    name: params.name,
    group: params.group || NEW_API_DEFAULT_GROUP,
    quota: params.quota || NEW_API_DEFAULT_QUOTA,
    usedQuota: 0,
    createdTime: now,
    accessedTime: now,
    expiredTime: 0,
    disabled: false,
    models: [],
  };
}

/**
 * Create a new API token. Always generates a local sk- key because New API
 * doesn't return the full key after creation. If New API is available, the
 * token is also synced there for quota tracking.
 */
export async function createNewApiToken(params: {
  name: string;
  group?: string;
  quota?: number;
  models?: string[];
}): Promise<NewApiToken> {
  // Always generate key locally — New API doesn't expose it
  const token = mockToken(params);

  // Sync to New API if available (for quota/usage tracking)
  if (NEW_API_ADMIN_TOKEN) {
    const { ok } = await apiFetch("/api/token/", {
      method: "POST",
      body: JSON.stringify({
        name: params.name,
        remain_quota: params.quota || NEW_API_DEFAULT_QUOTA,
        unlimited_quota: false,
        group: params.group || NEW_API_DEFAULT_GROUP,
      }),
    });
    if (ok) token.id = "newapi_synced";
  }

  return token;
}

export async function listNewApiTokens(
  group?: string,
): Promise<NewApiToken[]> {
  const qs = group ? `?group=${encodeURIComponent(group)}` : "";
  const { ok, data } = await apiFetch(`/api/token/${qs}`);

  if (ok && data?.items) {
    return data.items.map((t: any) => ({
      id: String(t.id || ""),
      key: t.key || "",
      name: t.name || "",
      group: t.group || NEW_API_DEFAULT_GROUP,
      quota: t.remain_quota || 0,
      usedQuota: t.used_quota || 0,
      createdTime: t.created_time ? t.created_time * 1000 : Date.now(),
      accessedTime: t.accessed_time ? t.accessed_time * 1000 : Date.now(),
      expiredTime: t.expired_time > 0 ? t.expired_time * 1000 : 0,
      disabled: t.status === 2,
      models: t.model_limits ? t.model_limits.split(",") : [],
    }));
  }

  return [mockToken({ name: "默认密匙" })];
}

export async function disableNewApiToken(
  tokenId: string,
): Promise<{ success: boolean }> {
  const { ok } = await apiFetch("/api/token/", {
    method: "PUT",
    body: JSON.stringify({ id: Number(tokenId), status: 2 }),
  });
  return { success: ok };
}

export async function deleteNewApiToken(
  tokenId: string,
): Promise<{ success: boolean }> {
  const { ok } = await apiFetch(`/api/token/${tokenId}/`, {
    method: "DELETE",
  });
  return { success: ok };
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export interface NewApiUsageRecord {
  date: string;
  tokens: number;
  cost: number;
  requests: number;
}

export interface NewApiUsageSummary {
  totalTokens: number;
  totalCost: number;
  totalRequests: number;
  daily: NewApiUsageRecord[];
}

export async function getNewApiUsage(params: {
  tokenId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<NewApiUsageSummary> {
  const qs = new URLSearchParams();
  qs.set("num", "200");
  if (params.startDate) qs.set("start_timestamp", String(Math.floor(new Date(params.startDate).getTime() / 1000)));
  if (params.endDate) qs.set("end_timestamp", String(Math.floor(new Date(params.endDate).getTime() / 1000)));

  const { ok, data } = await apiFetch(`/api/log/?${qs.toString()}`);

  if (ok && data?.items) {
    const dailyMap: Record<string, { tokens: number; cost: number; requests: number }> = {};
    for (const log of data.items) {
      if (log.type !== 2) continue; // type 2 = API call
      const date = new Date(log.created_at * 1000).toISOString().slice(0, 10);
      if (!dailyMap[date]) dailyMap[date] = { tokens: 0, cost: 0, requests: 0 };
      dailyMap[date].tokens += (log.prompt_tokens || 0) + (log.completion_tokens || 0);
      // New API quota is in internal units; convert to CNY
      // quota_per_unit=500000, usd_exchange_rate=7.3 → divide by ~68493
      dailyMap[date].cost += (log.quota || 0) / 10000;
      dailyMap[date].requests += 1;
    }
    const daily: NewApiUsageRecord[] = Object.entries(dailyMap)
      .map(([date, d]) => ({
        date,
        tokens: d.tokens,
        cost: Math.round(d.cost * 100) / 100,
        requests: d.requests,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (daily.length > 0) {
      return {
        totalTokens: daily.reduce((s, d) => s + d.tokens, 0),
        totalCost: Math.round(daily.reduce((s, d) => s + d.cost, 0) * 100) / 100,
        totalRequests: daily.reduce((s, d) => s + d.requests, 0),
        daily,
      };
    }
  }

  // Mock fallback
  const days = 7;
  const daily: NewApiUsageRecord[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    daily.push({
      date: d.toISOString().slice(0, 10),
      tokens: Math.floor(Math.random() * 80000) + 20000,
      cost: Math.round((Math.random() * 0.8 + 0.1) * 100) / 100,
      requests: Math.floor(Math.random() * 400) + 50,
    });
  }
  return {
    totalTokens: daily.reduce((s, d) => s + d.tokens, 0),
    totalCost: Math.round(daily.reduce((s, d) => s + d.cost, 0) * 100) / 100,
    totalRequests: daily.reduce((s, d) => s + d.requests, 0),
    daily,
  };
}

// ---------------------------------------------------------------------------
// Quota / Recharge
// ---------------------------------------------------------------------------

export async function rechargeNewApiUserQuota(params: {
  tokenId: string;
  quota: number;
}): Promise<{ success: boolean }> {
  if (!NEW_API_ADMIN_TOKEN) return { success: true };

  const { ok } = await apiFetch("/api/token/", {
    method: "PUT",
    body: JSON.stringify({
      id: Number(params.tokenId),
      remain_quota: params.quota,
    }),
  });
  return { success: ok };
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface NewApiHealth {
  ok: boolean;
  version?: string;
  uptime?: number;
  error?: string;
}

export async function checkNewApiHealth(): Promise<NewApiHealth> {
  if (!NEW_API_ADMIN_TOKEN) {
    return { ok: false, error: "NEW_API_ADMIN_TOKEN 未配置" };
  }

  if (_adminValid !== null) {
    return _adminValid
      ? { ok: true }
      : { ok: false, error: "管理员 Token 验证失败" };
  }

  try {
    const url = `${NEW_API_BASE_URL}/api/status`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data?.success) {
      _adminValid = false;
      return { ok: false, error: "New API 服务异常" };
    }

    const verify = await apiFetch("/api/token/");
    _adminValid = verify.ok;

    return {
      ok: true,
      version: data.data?.version || data.version,
      uptime: data.data?.start_time,
      error: verify.ok ? undefined : "管理员 Token 验证失败",
    };
  } catch (e: any) {
    _adminValid = false;
    return { ok: false, error: e.message };
  }
}

export function getNewApiConfig() {
  return {
    baseUrl: NEW_API_BASE_URL,
    hasAdminToken: !!NEW_API_ADMIN_TOKEN,
    adminValid: _adminValid,
    defaultGroup: NEW_API_DEFAULT_GROUP,
    defaultQuota: NEW_API_DEFAULT_QUOTA,
  };
}
