import crypto from "crypto";

const DEFAULT_TTLS = {
  apiKeyLookup: 30_000,
  customerSnapshot: 8_000,
  modelList: 60_000,
  modelProducts: 60_000,
  modelPricing: 60_000,
  routeCandidates: 30_000,
  routeDecision: 10_000,
  upstreamHealth: 10_000,
  adminStats: 30_000,
  imageModels: 60_000,
  imageHistory: 5_000,
  responseCache: 5 * 60_000,
};

const SENSITIVE_KEYS = new Set([
  "token",
  "apiKey",
  "api_key",
  "authorization",
  "password",
  "secret",
  "upstreamApiKey",
  "upstream_api_key",
]);

function now() {
  return Date.now();
}

function normalizeTtl(namespace, ttlMs) {
  const ttl = Number(ttlMs ?? DEFAULT_TTLS[namespace] ?? 30_000);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 30_000;
}

export function hashCacheKey(value = "") {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (SENSITIVE_KEYS.has(key) && (typeof item === "string" || typeof item === "number")) return [key, ""];
    if (String(key).toLowerCase().includes("token") && typeof item === "string" && item.startsWith("sk-")) return [key, ""];
    return [key, redactSensitive(item)];
  }));
}

class MemoryCacheManager {
  constructor() {
    this.namespaces = new Map();
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      invalidations: 0,
      namespaces: {},
    };
  }

  bucket(namespace) {
    if (!this.namespaces.has(namespace)) this.namespaces.set(namespace, new Map());
    if (!this.metrics.namespaces[namespace]) {
      this.metrics.namespaces[namespace] = { hits: 0, misses: 0, sets: 0, size: 0 };
    }
    return this.namespaces.get(namespace);
  }

  get(namespace, key) {
    const bucket = this.bucket(namespace);
    const entry = bucket.get(key);
    if (!entry || entry.expiresAt <= now()) {
      if (entry) bucket.delete(key);
      this.metrics.misses += 1;
      this.metrics.namespaces[namespace].misses += 1;
      this.metrics.namespaces[namespace].size = bucket.size;
      return null;
    }
    this.metrics.hits += 1;
    this.metrics.namespaces[namespace].hits += 1;
    return entry.value;
  }

  set(namespace, key, value, ttlMs) {
    const bucket = this.bucket(namespace);
    bucket.set(key, {
      value: redactSensitive(value),
      expiresAt: now() + normalizeTtl(namespace, ttlMs),
      createdAt: now(),
    });
    this.metrics.sets += 1;
    this.metrics.namespaces[namespace].sets += 1;
    this.metrics.namespaces[namespace].size = bucket.size;
    return value;
  }

  async remember(namespace, key, ttlMs, loader) {
    const cached = this.get(namespace, key);
    if (cached !== null) return { value: cached, cacheHit: true };
    const value = await loader();
    this.set(namespace, key, value, ttlMs);
    return { value, cacheHit: false };
  }

  invalidate(namespace, key = null) {
    if (!namespace) return;
    if (!this.namespaces.has(namespace)) return;
    if (key === null) {
      this.namespaces.get(namespace).clear();
    } else {
      this.namespaces.get(namespace).delete(key);
    }
    this.metrics.invalidations += 1;
    if (this.metrics.namespaces[namespace]) {
      this.metrics.namespaces[namespace].size = this.namespaces.get(namespace).size;
    }
  }

  invalidatePrefix(namespace, prefix = "") {
    const bucket = this.namespaces.get(namespace);
    if (!bucket) return;
    for (const key of bucket.keys()) {
      if (String(key).startsWith(prefix)) bucket.delete(key);
    }
    this.metrics.invalidations += 1;
    if (this.metrics.namespaces[namespace]) this.metrics.namespaces[namespace].size = bucket.size;
  }

  invalidateAll(namespaces = []) {
    namespaces.forEach((namespace) => this.invalidate(namespace));
  }

  stats() {
    const total = this.metrics.hits + this.metrics.misses;
    return {
      ...this.metrics,
      hitRate: total > 0 ? Number((this.metrics.hits / total).toFixed(4)) : 0,
      backend: "memory",
      redisEnabled: Boolean(process.env.REDIS_URL),
    };
  }
}

const cache = globalThis.__FLOWAPI_CACHE_MANAGER__ || new MemoryCacheManager();
globalThis.__FLOWAPI_CACHE_MANAGER__ = cache;

export function getCacheManager() {
  return cache;
}

export function invalidateApiKeyCache(token = "") {
  if (!token) {
    cache.invalidate("apiKeyLookup");
    return;
  }
  cache.invalidate("apiKeyLookup", hashCacheKey(token));
}

export function invalidateCustomerCache(customerId = "") {
  if (!customerId) return;
  cache.invalidate("customerSnapshot", customerId);
  cache.invalidate("adminStats");
}

export function invalidateModelCaches() {
  cache.invalidateAll(["modelList", "modelProducts", "modelPricing", "routeCandidates", "routeDecision", "adminStats"]);
}

export function invalidateRouteCaches(publicModelId = "") {
  if (publicModelId) {
    cache.invalidatePrefix("routeCandidates", `${publicModelId}:`);
    cache.invalidatePrefix("routeDecision", `${publicModelId}:`);
  } else {
    cache.invalidate("routeCandidates");
    cache.invalidate("routeDecision");
  }
  cache.invalidate("adminStats");
}

export function invalidateBillingCaches(customerId = "") {
  if (customerId) invalidateCustomerCache(customerId);
  cache.invalidate("apiKeyLookup");
  cache.invalidate("adminStats");
}

export function shouldUseResponseCache(body = {}) {
  if (body.no_cache || body.noCache) return false;
  if (body.stream) return false;
  if (body.tools || body.functions || body.file || body.files || body.images) return false;
  const text = JSON.stringify(body.messages || body.input || body.prompt || "");
  if (!text || text.length > 1500) return false;
  const privateHints = ["api key", "密码", "合同", "身份证", "支付", "银行卡", "上传文件", "代码仓库"];
  return !privateHints.some((hint) => text.toLowerCase().includes(hint.toLowerCase()));
}

export function buildResponseCacheKey({ userId = "", model = "", body = {} } = {}) {
  const payload = {
    userId,
    model,
    messages: body.messages || body.input || body.prompt || "",
    system: body.system || body.instructions || "",
    temperature: body.temperature ?? null,
    maxTokens: body.max_tokens ?? body.max_output_tokens ?? null,
    tools: body.tools ? hashCacheKey(JSON.stringify(body.tools)) : "",
  };
  return hashCacheKey(JSON.stringify(payload));
}

export const CACHE_TTLS = DEFAULT_TTLS;
