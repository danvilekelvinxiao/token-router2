import crypto from "crypto";
import { hasDatabase, query } from "./db";

const DEFAULT_PRICING_VERSION = process.env.FLOWAPI_PRICING_VERSION || "2026-06-16.v1";
const DEFAULT_BILLING_SOURCE = process.env.FLOWAPI_BILLING_SOURCE || "platform_pricing_table";

function auditStore() {
  const root = globalThis.__TOKEN_ROUTER_CUSTOMERS__ || (globalThis.__TOKEN_ROUTER_CUSTOMERS__ = {});
  if (!Array.isArray(root.relayRequestAudits)) root.relayRequestAudits = [];
  return root.relayRequestAudits;
}

function toIso(value = "") {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function safeJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  if (typeof value === "object") return value;
  return fallback;
}

function normalizeRelayAudit(input = {}) {
  const requestId = String(input.requestId || input.request_id || "").trim();
  const createdAt = toIso(input.createdAt || input.created_at);
  const completedAt = toIso(input.completedAt || input.completed_at || createdAt);
  const inputTokens = Math.max(0, Math.floor(Number(input.inputTokens ?? input.input_tokens ?? 0)));
  const outputTokens = Math.max(0, Math.floor(Number(input.outputTokens ?? input.output_tokens ?? 0)));
  const cacheCreationInputTokens = Math.max(0, Math.floor(Number(input.cacheCreationInputTokens ?? input.cache_creation_input_tokens ?? 0)));
  const cacheReadInputTokens = Math.max(0, Math.floor(Number(input.cacheReadInputTokens ?? input.cache_read_input_tokens ?? 0)));
  const balanceBefore = Number(input.balanceBefore ?? input.balance_before ?? 0);
  const balanceAfter = Number(input.balanceAfter ?? input.balance_after ?? balanceBefore);
  const cost = Number(input.cost ?? 0);
  const billingDiff = Number(input.billingDiff ?? input.billing_diff ?? 0);
  const responseId = String(input.responseId || input.response_id || "").trim();
  const upstreamRequestId = String(input.upstreamRequestId || input.upstream_request_id || "").trim();
  const provider = String(input.provider || "").trim();
  const model = String(input.model || "").trim();
  const route = String(input.route || input.endpoint || "").trim();

  return {
    id: String(input.id || `relay_audit_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`),
    requestId,
    upstreamRequestId,
    responseId,
    provider,
    model,
    apiKeyFingerprint: String(input.apiKeyFingerprint || input.api_key_fingerprint || "").trim(),
    customerId: String(input.customerId || input.customer_id || "").trim(),
    route,
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    usageRaw: safeJson(input.usageRaw || input.usage_raw || {}, {}),
    promptHash: String(input.promptHash || input.prompt_hash || "").trim(),
    balanceBefore,
    balanceAfter,
    cost,
    currency: String(input.currency || "CNY").trim() || "CNY",
    pricingVersion: String(input.pricingVersion || input.pricing_version || DEFAULT_PRICING_VERSION).trim() || DEFAULT_PRICING_VERSION,
    billingSource: String(input.billingSource || input.billing_source || DEFAULT_BILLING_SOURCE).trim() || DEFAULT_BILLING_SOURCE,
    billingConsistent: input.billingConsistent !== undefined ? Boolean(input.billingConsistent) : true,
    billingDiff,
    billingAlert: String(input.billingAlert || input.billing_alert || "").trim(),
    userMessageChars: Math.max(0, Math.floor(Number(input.userMessageChars ?? input.user_message_chars ?? 0))),
    userMessageCount: Math.max(0, Math.floor(Number(input.userMessageCount ?? input.user_message_count ?? 0))),
    serverSystemChars: Math.max(0, Math.floor(Number(input.serverSystemChars ?? input.server_system_chars ?? 0))),
    toolSchemaChars: Math.max(0, Math.floor(Number(input.toolSchemaChars ?? input.tool_schema_chars ?? 0))),
    messagesBeforeEnrich: Math.max(0, Math.floor(Number(input.messagesBeforeEnrich ?? input.messages_before_enrich ?? 0))),
    messagesAfterEnrich: Math.max(0, Math.floor(Number(input.messagesAfterEnrich ?? input.messages_after_enrich ?? 0))),
    enrichmentSources: Array.isArray(input.enrichmentSources || input.enrichment_sources)
      ? (input.enrichmentSources || input.enrichment_sources).map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    tokenAnomalyFlag: Boolean(input.tokenAnomalyFlag ?? input.token_anomaly_flag ?? false),
    compensationStatus: String(input.compensationStatus || input.compensation_status || "none").trim() || "none",
    compensationAmount: Number(input.compensationAmount ?? input.compensation_amount ?? 0),
    statusCode: Number(input.statusCode ?? input.status_code ?? 0),
    success: Boolean(input.success ?? false),
    errorCode: String(input.errorCode || input.error_code || "").trim(),
    errorMessage: String(input.errorMessage || input.error_message || "").trim(),
    createdAt,
    completedAt,
    latencyMs: Number(input.latencyMs ?? input.latency_ms ?? 0),
  };
}

function relayAuditToRow(audit = {}) {
  return {
    id: audit.id,
    request_id: audit.requestId,
    upstream_request_id: audit.upstreamRequestId,
    response_id: audit.responseId,
    provider: audit.provider,
    model: audit.model,
    api_key_fingerprint: audit.apiKeyFingerprint,
    customer_id: audit.customerId,
    route: audit.route,
    input_tokens: audit.inputTokens,
    output_tokens: audit.outputTokens,
    cache_creation_input_tokens: audit.cacheCreationInputTokens,
    cache_read_input_tokens: audit.cacheReadInputTokens,
    usage_raw: JSON.stringify(audit.usageRaw || {}),
    prompt_hash: audit.promptHash,
    balance_before: audit.balanceBefore,
    balance_after: audit.balanceAfter,
    cost: audit.cost,
    currency: audit.currency,
    pricing_version: audit.pricingVersion,
    billing_source: audit.billingSource,
    billing_consistent: audit.billingConsistent,
    billing_diff: audit.billingDiff,
    billing_alert: audit.billingAlert,
    user_message_chars: audit.userMessageChars,
    user_message_count: audit.userMessageCount,
    server_system_chars: audit.serverSystemChars,
    tool_schema_chars: audit.toolSchemaChars,
    messages_before_enrich: audit.messagesBeforeEnrich,
    messages_after_enrich: audit.messagesAfterEnrich,
    enrichment_sources: JSON.stringify(audit.enrichmentSources || []),
    token_anomaly_flag: audit.tokenAnomalyFlag,
    compensation_status: audit.compensationStatus,
    compensation_amount: audit.compensationAmount,
    status_code: audit.statusCode,
    success: audit.success,
    error_code: audit.errorCode,
    error_message: audit.errorMessage,
    created_at: audit.createdAt,
    completed_at: audit.completedAt,
    latency_ms: audit.latencyMs,
  };
}

function relayAuditFromRow(row = {}) {
  if (!row) return null;
  return {
    id: row.id,
    requestId: row.request_id || "",
    upstreamRequestId: row.upstream_request_id || "",
    responseId: row.response_id || "",
    provider: row.provider || "",
    model: row.model || "",
    apiKeyFingerprint: row.api_key_fingerprint || "",
    customerId: row.customer_id || "",
    route: row.route || "",
    inputTokens: Number(row.input_tokens || 0),
    outputTokens: Number(row.output_tokens || 0),
    cacheCreationInputTokens: Number(row.cache_creation_input_tokens || 0),
    cacheReadInputTokens: Number(row.cache_read_input_tokens || 0),
    usageRaw: safeJson(row.usage_raw || {}, {}),
    promptHash: row.prompt_hash || "",
    balanceBefore: Number(row.balance_before || 0),
    balanceAfter: Number(row.balance_after || 0),
    cost: Number(row.cost || 0),
    currency: row.currency || "CNY",
    pricingVersion: row.pricing_version || DEFAULT_PRICING_VERSION,
    billingSource: row.billing_source || DEFAULT_BILLING_SOURCE,
    billingConsistent: Boolean(row.billing_consistent),
    billingDiff: Number(row.billing_diff || 0),
    billingAlert: row.billing_alert || "",
    userMessageChars: Number(row.user_message_chars || 0),
    userMessageCount: Number(row.user_message_count || 0),
    serverSystemChars: Number(row.server_system_chars || 0),
    toolSchemaChars: Number(row.tool_schema_chars || 0),
    messagesBeforeEnrich: Number(row.messages_before_enrich || 0),
    messagesAfterEnrich: Number(row.messages_after_enrich || 0),
    enrichmentSources: safeJson(row.enrichment_sources || [], []),
    tokenAnomalyFlag: Boolean(row.token_anomaly_flag),
    compensationStatus: row.compensation_status || "none",
    compensationAmount: Number(row.compensation_amount || 0),
    statusCode: Number(row.status_code || 0),
    success: Boolean(row.success),
    errorCode: row.error_code || "",
    errorMessage: row.error_message || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : new Date().toISOString(),
    latencyMs: Number(row.latency_ms || 0),
  };
}

function upsertMemoryAudit(audit) {
  const store = auditStore();
  const index = store.findIndex((item) => item.requestId === audit.requestId);
  if (index >= 0) {
    store[index] = audit;
  } else {
    store.unshift(audit);
  }
  return audit;
}

export async function recordRelayRequestAudit(input = {}) {
  const audit = normalizeRelayAudit(input);
  if (!audit.requestId) return null;

  if (!hasDatabase()) {
    return upsertMemoryAudit(audit);
  }

  const row = relayAuditToRow(audit);
  await query(
    `INSERT INTO relay_request_audits (
      id, request_id, upstream_request_id, response_id, provider, model, api_key_fingerprint,
      customer_id, route, input_tokens, output_tokens, cache_creation_input_tokens,
      cache_read_input_tokens, usage_raw, prompt_hash, balance_before, balance_after, cost,
      currency, pricing_version, billing_source, billing_consistent, billing_diff, billing_alert,
      user_message_chars, user_message_count, server_system_chars, tool_schema_chars,
      messages_before_enrich, messages_after_enrich, enrichment_sources, token_anomaly_flag,
      compensation_status, compensation_amount, status_code, success, error_code, error_message,
      created_at, completed_at, latency_ms
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,$11,$12,
      $13,$14,$15,$16,$17,$18,
      $19,$20,$21,$22,$23,$24,
      $25,$26,$27,$28,$29,$30,$31,$32,
      $33,$34,$35,$36,$37,$38,$39,$40,$41
    )
    ON CONFLICT (request_id) DO UPDATE SET
      upstream_request_id = EXCLUDED.upstream_request_id,
      response_id = EXCLUDED.response_id,
      provider = EXCLUDED.provider,
      model = EXCLUDED.model,
      api_key_fingerprint = EXCLUDED.api_key_fingerprint,
      customer_id = EXCLUDED.customer_id,
      route = EXCLUDED.route,
      input_tokens = EXCLUDED.input_tokens,
      output_tokens = EXCLUDED.output_tokens,
      cache_creation_input_tokens = EXCLUDED.cache_creation_input_tokens,
      cache_read_input_tokens = EXCLUDED.cache_read_input_tokens,
      usage_raw = EXCLUDED.usage_raw,
      prompt_hash = EXCLUDED.prompt_hash,
      balance_before = EXCLUDED.balance_before,
      balance_after = EXCLUDED.balance_after,
      cost = EXCLUDED.cost,
      currency = EXCLUDED.currency,
      pricing_version = EXCLUDED.pricing_version,
      billing_source = EXCLUDED.billing_source,
      billing_consistent = EXCLUDED.billing_consistent,
      billing_diff = EXCLUDED.billing_diff,
      billing_alert = EXCLUDED.billing_alert,
      user_message_chars = EXCLUDED.user_message_chars,
      user_message_count = EXCLUDED.user_message_count,
      server_system_chars = EXCLUDED.server_system_chars,
      tool_schema_chars = EXCLUDED.tool_schema_chars,
      messages_before_enrich = EXCLUDED.messages_before_enrich,
      messages_after_enrich = EXCLUDED.messages_after_enrich,
      enrichment_sources = EXCLUDED.enrichment_sources,
      token_anomaly_flag = EXCLUDED.token_anomaly_flag,
      compensation_status = EXCLUDED.compensation_status,
      compensation_amount = EXCLUDED.compensation_amount,
      status_code = EXCLUDED.status_code,
      success = EXCLUDED.success,
      error_code = EXCLUDED.error_code,
      error_message = EXCLUDED.error_message,
      completed_at = EXCLUDED.completed_at,
      latency_ms = EXCLUDED.latency_ms`,
    [
      row.id, row.request_id, row.upstream_request_id, row.response_id, row.provider, row.model, row.api_key_fingerprint,
      row.customer_id, row.route, row.input_tokens, row.output_tokens, row.cache_creation_input_tokens,
      row.cache_read_input_tokens, row.usage_raw, row.prompt_hash, row.balance_before, row.balance_after, row.cost,
      row.currency, row.pricing_version, row.billing_source, row.billing_consistent, row.billing_diff, row.billing_alert,
      row.user_message_chars, row.user_message_count, row.server_system_chars, row.tool_schema_chars,
      row.messages_before_enrich, row.messages_after_enrich, row.enrichment_sources, row.token_anomaly_flag,
      row.compensation_status, row.compensation_amount, row.status_code, row.success, row.error_code, row.error_message,
      row.created_at, row.completed_at, row.latency_ms,
    ]
  );
  return audit;
}

export async function getLatestRelayRequestAudit() {
  if (!hasDatabase()) {
    return auditStore()[0] || null;
  }
  const result = await query("SELECT * FROM relay_request_audits ORDER BY created_at DESC LIMIT 1");
  return relayAuditFromRow(result?.rows?.[0] || null);
}

export async function getRelayRequestAuditByRequestId(requestId = "") {
  const cleanRequestId = String(requestId || "").trim();
  if (!cleanRequestId) return null;
  if (!hasDatabase()) {
    return auditStore().find((item) => item.requestId === cleanRequestId) || null;
  }
  const result = await query("SELECT * FROM relay_request_audits WHERE request_id = $1 LIMIT 1", [cleanRequestId]);
  return relayAuditFromRow(result?.rows?.[0] || null);
}

export function relayAuditToPublicPayload(audit = null) {
  if (!audit) return null;
  const normalized = audit.requestId ? audit : normalizeRelayAudit(audit);
  return {
    id: normalized.id,
    request_id: normalized.requestId,
    upstream_request_id: normalized.upstreamRequestId || "",
    response_id: normalized.responseId || "",
    provider: normalized.provider || "",
    model: normalized.model || "",
    api_key_fingerprint: normalized.apiKeyFingerprint || "",
    customer_id: normalized.customerId || "",
    route: normalized.route || "",
    input_tokens: normalized.inputTokens || 0,
    output_tokens: normalized.outputTokens || 0,
    cache_creation_input_tokens: normalized.cacheCreationInputTokens || 0,
    cache_read_input_tokens: normalized.cacheReadInputTokens || 0,
    usage_raw: normalized.usageRaw || {},
    prompt_hash: normalized.promptHash || "",
    balance_before: normalized.balanceBefore || 0,
    balance_after: normalized.balanceAfter || 0,
    cost: normalized.cost || 0,
    currency: normalized.currency || "CNY",
    pricing_version: normalized.pricingVersion || DEFAULT_PRICING_VERSION,
    billing_source: normalized.billingSource || DEFAULT_BILLING_SOURCE,
    billing_consistent: Boolean(normalized.billingConsistent),
    billing_diff: normalized.billingDiff || 0,
    billing_alert: normalized.billingAlert || "",
    user_message_chars: normalized.userMessageChars || 0,
    user_message_count: normalized.userMessageCount || 0,
    server_system_chars: normalized.serverSystemChars || 0,
    tool_schema_chars: normalized.toolSchemaChars || 0,
    messages_before_enrich: normalized.messagesBeforeEnrich || 0,
    messages_after_enrich: normalized.messagesAfterEnrich || 0,
    enrichment_sources: normalized.enrichmentSources || [],
    token_anomaly_flag: Boolean(normalized.tokenAnomalyFlag),
    compensation_status: normalized.compensationStatus || "none",
    compensation_amount: normalized.compensationAmount || 0,
    status_code: normalized.statusCode || 0,
    success: Boolean(normalized.success),
    error_code: normalized.errorCode || "",
    error_message: normalized.errorMessage || "",
    created_at: normalized.createdAt || new Date().toISOString(),
    completed_at: normalized.completedAt || normalized.createdAt || new Date().toISOString(),
    latency_ms: normalized.latencyMs || 0,
  };
}
