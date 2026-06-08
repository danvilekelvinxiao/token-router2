/**
 * New API client — wraps the upstream New API admin endpoints.
 * All functions are server-only. Never import this in browser code.
 *
 * Strategy:
 * - Token keys: created in New API, then fetched once via /api/token/:id/key.
 * - Usage data: fetched from New API /api/log/ when admin token is valid.
 * - Quota sync: pushed to New API /api/token/ (PUT) when admin token is valid.
 * - Health: verified by checking New API /api/status and /api/token/.
 *
 * Important: customer-facing API Keys are FlowAPI keys first. Per-user New API
 * token sync is optional; when disabled, FlowAPI routes with server-side group
 * tokens while the local ledger remains the only customer billing authority.
 */

const NEW_API_BASE_URL =
  process.env.NEW_API_BASE_URL || "http://localhost:3001";
const NEW_API_ADMIN_TOKEN =
  process.env.NEW_API_ADMIN_TOKEN || process.env.NEW_API_KEY || "";
const NEW_API_DEFAULT_GROUP =
  process.env.NEW_API_DEFAULT_GROUP || "default";
const NEW_API_DEFAULT_QUOTA = Number(
  process.env.NEW_API_DEFAULT_QUOTA || 500000,
);
const NEW_API_TOKEN_UNLIMITED =
  process.env.NEW_API_TOKEN_UNLIMITED === "true";

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

/**
 * Create a new API token in New API and return the real full key.
 * New API's create endpoint only returns success, so we list recent tokens by
 * name and then call /api/token/:id/key to fetch the one-time full key.
 */
export async function createNewApiToken(params: {
  name: string;
  group?: string;
  quota?: number;
  models?: string[];
}): Promise<NewApiToken> {
  if (!NEW_API_ADMIN_TOKEN) {
    throw new Error("NEW_API_ADMIN_TOKEN 或 NEW_API_KEY 未配置，无法创建真实 New API API Key");
  }

  const nameLimit = Number(process.env.NEW_API_TOKEN_NAME_MAX_LENGTH || 30);
  const name = String(params.name || "API Key").slice(0, Math.max(12, Math.min(nameLimit, 30)));
  const group = params.group || NEW_API_DEFAULT_GROUP;
  const quota = params.quota || NEW_API_DEFAULT_QUOTA;
  const beforeCreate = Math.floor(Date.now() / 1000) - 5;

  const create = await apiFetch("/api/token/", {
    method: "POST",
    body: JSON.stringify({
      name,
      remain_quota: quota,
      unlimited_quota: NEW_API_TOKEN_UNLIMITED,
      group,
      expired_time: -1,
      ...(params.models?.length
        ? { model_limits_enabled: true, model_limits: params.models.join(",") }
        : {}),
    }),
  });

  if (!create.ok) {
    throw new Error(create.data?.message || create.data?.error || "New API API Key 创建失败");
  }

  const list = await apiFetch("/api/token/?p=1&size=50");
  const items = Array.isArray(list.data?.items) ? list.data.items : [];
  const matched = items
    .filter((item: any) => item.name === name && Number(item.created_time || 0) >= beforeCreate)
    .sort((a: any, b: any) => Number(b.id || 0) - Number(a.id || 0))[0]
    || items.filter((item: any) => item.name === name).sort((a: any, b: any) => Number(b.id || 0) - Number(a.id || 0))[0];

  if (!matched?.id) {
    throw new Error("New API API Key 已创建，但无法读取 Key ID");
  }

  const keyResponse = await apiFetch(`/api/token/${matched.id}/key`, { method: "POST" });
  let key = keyResponse.data?.key || keyResponse.data?.token || keyResponse.data?.data?.key;

  if (!key) {
    throw new Error("New API API Key 已创建，但无法读取完整 Key");
  }

  key = String(key).trim();
  if (!key) {
    throw new Error("New API API Key 已创建，但返回的 Key 为空");
  }
  // New API v1.0.0-rc.6 returns the token secret body from /api/token/:id/key.
  // The user-facing/runtime token is the same secret with New API's sk- prefix.
  // Only normalize a secret returned by New API; never generate a local fallback.
  if (!key.startsWith("sk-")) {
    key = `sk-${key}`;
  }

  return {
    id: String(matched.id),
    key,
    name: matched.name || name,
    group: matched.group || group,
    quota: Number(matched.remain_quota ?? quota),
    usedQuota: Number(matched.used_quota || 0),
    createdTime: matched.created_time ? Number(matched.created_time) * 1000 : Date.now(),
    accessedTime: matched.accessed_time ? Number(matched.accessed_time) * 1000 : Date.now(),
    expiredTime: matched.expired_time > 0 ? Number(matched.expired_time) * 1000 : 0,
    disabled: matched.status === 2,
    models: matched.model_limits ? String(matched.model_limits).split(",").filter(Boolean) : [],
  };
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

  return [];
}

export async function disableNewApiToken(
  tokenId: string,
): Promise<{ success: boolean }> {
  const existing = await getNewApiTokenForUpdate(tokenId);
  const { ok } = await apiFetch("/api/token/", {
    method: "PUT",
    body: JSON.stringify({ ...existing, id: Number(tokenId), status: 2 }),
  });
  return { success: ok };
}

export async function enableNewApiToken(
  tokenId: string,
): Promise<{ success: boolean }> {
  const existing = await getNewApiTokenForUpdate(tokenId);
  const { ok } = await apiFetch("/api/token/", {
    method: "PUT",
    body: JSON.stringify({ ...existing, id: Number(tokenId), status: 1 }),
  });
  return { success: ok };
}

async function getNewApiTokenForUpdate(tokenId: string): Promise<Record<string, any>> {
  const id = Number(tokenId);
  const { ok, data } = await apiFetch(`/api/token/${id}`);
  const token = ok ? (data?.token || data) : null;

  if (!token || typeof token !== "object") {
    return { id };
  }

  const payload: Record<string, any> = {
    id,
    name: token.name || "FlowAPI API Key",
    expired_time: Number(token.expired_time ?? -1),
    remain_quota: Number(token.remain_quota ?? NEW_API_DEFAULT_QUOTA),
    unlimited_quota: Boolean(token.unlimited_quota ?? NEW_API_TOKEN_UNLIMITED),
    model_limits_enabled: Boolean(token.model_limits_enabled),
    model_limits: token.model_limits || "",
    allow_ips: token.allow_ips || "",
    group: token.group || NEW_API_DEFAULT_GROUP,
    cross_group_retry: Boolean(token.cross_group_retry),
  };

  return payload;
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

  return {
    totalTokens: 0,
    totalCost: 0,
    totalRequests: 0,
    daily: [],
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
