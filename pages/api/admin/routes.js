import { requireAdmin } from "@/lib/admin-auth";
import { hasDatabase, query } from "@/lib/db";
import { getCacheManager, invalidateRouteCaches } from "@/lib/cache-manager";
import { listRouteMatrix, updateRouteChannel } from "@/lib/smart-router";

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return typeof body === "object" ? body : {};
}

async function seedRouteChannel(body = {}) {
  if (!hasDatabase()) return null;
  const id = String(body.id || `up_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`);
  const publicModelId = String(body.publicModelId || body.public_model_id || "").trim();
  const actualModelId = String(body.actualModelId || body.actual_model_id || "").trim();
  const providerName = String(body.providerName || body.provider_name || "").trim();
  const channelName = String(body.channelName || body.channel_name || providerName || "未命名通道").trim();
  if (!publicModelId || !channelName) {
    const error = new Error("缺少 public_model_id 或渠道名称");
    error.status = 400;
    throw error;
  }
  const result = await query(
    `INSERT INTO upstream_channels (
       id, provider_name, channel_name, base_url, actual_model_id, public_model_id, group_name,
       input_cost_per_million, output_cost_per_million, currency, priority, quality_score,
       route_strategy, is_enabled, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
     ON CONFLICT (id) DO UPDATE SET
       provider_name = EXCLUDED.provider_name,
       channel_name = EXCLUDED.channel_name,
       base_url = EXCLUDED.base_url,
       actual_model_id = EXCLUDED.actual_model_id,
       public_model_id = EXCLUDED.public_model_id,
       group_name = EXCLUDED.group_name,
       input_cost_per_million = EXCLUDED.input_cost_per_million,
       output_cost_per_million = EXCLUDED.output_cost_per_million,
       currency = EXCLUDED.currency,
       priority = EXCLUDED.priority,
       quality_score = EXCLUDED.quality_score,
       route_strategy = EXCLUDED.route_strategy,
       is_enabled = EXCLUDED.is_enabled,
       updated_at = NOW()
     RETURNING *`,
    [
      id,
      providerName,
      channelName,
      String(body.baseUrl || body.base_url || "").trim(),
      actualModelId,
      publicModelId,
      String(body.groupName || body.group_name || "").trim(),
      Number(body.inputCostPerMillion ?? body.input_cost_per_million ?? 0),
      Number(body.outputCostPerMillion ?? body.output_cost_per_million ?? 0),
      String(body.currency || "CNY").trim() || "CNY",
      Number(body.priority ?? 10),
      Number(body.qualityScore ?? body.quality_score ?? 80),
      String(body.routeStrategy || body.route_strategy || "balanced"),
      body.isEnabled === true || body.is_enabled === true,
    ]
  );
  invalidateRouteCaches(publicModelId);
  return result.rows[0];
}

async function recentFailures(publicModelId = "") {
  if (!hasDatabase()) {
    const attempts = globalThis.__TOKEN_ROUTER_CUSTOMERS__?.routeAttempts || [];
    return attempts
      .filter((row) => Number(row.ok) !== true && (!publicModelId || row.public_model_id === publicModelId))
      .map((row) => ({
        requestId: row.request_id || "",
        publicModelId: row.public_model_id || "",
        requestedModel: row.requested_model || "",
        requestedModelName: row.requested_model_name || "",
        actualModelId: row.actual_model_id || "",
        upstreamModelName: row.upstream_model_name || "",
        upstreamChannelId: row.upstream_channel_id || "",
        upstreamChannel: row.upstream_channel || "",
        upstreamProvider: row.upstream_provider || "",
        upstreamUrl: row.upstream_url || "",
        apiKeyPreview: row.api_key_preview || "",
        attemptIndex: Number(row.attempt_index || 0),
        statusCode: Number(row.status_code || 0),
        errorCode: row.error_code || "",
        errorKind: row.error_kind || "",
        paymentRequired: row.payment_required === true,
        errorMessage: row.error_message || "",
        latencyMs: Number(row.latency_ms || 0),
        firstTokenMs: Number(row.first_token_ms || 0),
        createdAt: row.created_at || new Date().toISOString(),
      }))
      .slice(0, 30);
  }
  const result = await query(
    `SELECT request_id, public_model_id, requested_model, requested_model_name, actual_model_id, upstream_model_name,
            upstream_channel, upstream_provider, upstream_channel_id, upstream_url, api_key_preview,
            attempt_index, status_code, error_code, error_kind, payment_required, error_message, latency_ms, first_token_ms, created_at
     FROM route_attempts
     WHERE ok = false
       AND ($1 = '' OR public_model_id = $1)
     ORDER BY created_at DESC
     LIMIT 30`,
    [publicModelId || ""]
  );
  return result.rows.map((row) => ({
    requestId: row.request_id,
    publicModelId: row.public_model_id,
    requestedModel: row.requested_model || "",
    requestedModelName: row.requested_model_name || "",
    actualModelId: row.actual_model_id,
    upstreamModelName: row.upstream_model_name || "",
    upstreamChannelId: row.upstream_channel_id,
    upstreamChannel: row.upstream_channel,
    upstreamProvider: row.upstream_provider,
    upstreamUrl: row.upstream_url || "",
    apiKeyPreview: row.api_key_preview || "",
    attemptIndex: Number(row.attempt_index || 0),
    statusCode: Number(row.status_code || 0),
    errorCode: row.error_code || "",
    errorKind: row.error_kind || "",
    paymentRequired: row.payment_required === true,
    errorMessage: row.error_message || "",
    latencyMs: Number(row.latency_ms || 0),
    firstTokenMs: Number(row.first_token_ms || 0),
    createdAt: row.created_at,
  }));
}

async function performanceStats(matrix = []) {
  const cacheStats = getCacheManager().stats();
  const stats = {
    avgFirstTokenMs: 0,
    p95FirstTokenMs: 0,
    avgLatencyMs: 0,
    p95LatencyMs: 0,
    cacheHitRate: cacheStats.hitRate,
    routeSwitchCount: 0,
    upstreamFailureRate: 0,
    upstream429Count: 0,
    upstream402Count: 0,
    fastestByModel: [],
    cheapestByModel: [],
    stableByModel: [],
  };

  stats.fastestByModel = matrix.map((route) => ({
    publicModelId: route.publicModelId,
    channel: [...(route.candidates || [])].sort((a, b) => Number(a.avgFirstTokenMs || 999999) - Number(b.avgFirstTokenMs || 999999))[0]?.channelName || "",
  })).filter((item) => item.channel);
  stats.cheapestByModel = matrix.map((route) => ({
    publicModelId: route.publicModelId,
    channel: [...(route.candidates || [])].sort((a, b) => (Number(a.inputCostPerMillion || 0) + Number(a.outputCostPerMillion || 0)) - (Number(b.inputCostPerMillion || 0) + Number(b.outputCostPerMillion || 0)))[0]?.channelName || "",
  })).filter((item) => item.channel);
  stats.stableByModel = matrix.map((route) => ({
    publicModelId: route.publicModelId,
    channel: [...(route.candidates || [])].sort((a, b) => Number(b.successRate || 0) - Number(a.successRate || 0))[0]?.channelName || "",
  })).filter((item) => item.channel);

  if (!hasDatabase()) return stats;
  try {
    const result = await query(`
      SELECT
        COALESCE(AVG(NULLIF(first_token_ms, 0)), 0) AS avg_first,
        COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY NULLIF(first_token_ms, 0)), 0) AS p95_first,
        COALESCE(AVG(NULLIF(latency_ms, 0)), 0) AS avg_latency,
        COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY NULLIF(latency_ms, 0)), 0) AS p95_latency,
        COALESCE(SUM(GREATEST(route_attempts - 1, 0)), 0) AS route_switches,
        COUNT(*) FILTER (WHERE upstream_status = 429) AS upstream_429,
        COUNT(*) FILTER (WHERE upstream_status = 402) AS upstream_402,
        COUNT(*) FILTER (WHERE status >= 500 OR upstream_status >= 500) AS failures,
        COUNT(*) AS total
      FROM calls
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);
    const row = result.rows[0] || {};
    stats.avgFirstTokenMs = Math.round(Number(row.avg_first || 0));
    stats.p95FirstTokenMs = Math.round(Number(row.p95_first || 0));
    stats.avgLatencyMs = Math.round(Number(row.avg_latency || 0));
    stats.p95LatencyMs = Math.round(Number(row.p95_latency || 0));
    stats.routeSwitchCount = Number(row.route_switches || 0);
    stats.upstream429Count = Number(row.upstream_429 || 0);
    stats.upstream402Count = Number(row.upstream_402 || 0);
    stats.upstreamFailureRate = Number(row.total || 0) > 0 ? Number((Number(row.failures || 0) / Number(row.total || 1)).toFixed(4)) : 0;
  } catch {
    // Monitoring must not block admin page.
  }
  return stats;
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method === "GET") {
    try {
      const matrix = await listRouteMatrix();
      const publicModelId = String(req.query.publicModelId || "").trim();
      const [failures, performance] = await Promise.all([
        recentFailures(publicModelId).catch(() => []),
        performanceStats(matrix).catch(() => ({})),
      ]);
      return res.status(200).json({
        ok: true,
        routes: matrix,
        failures,
        performance,
        database: hasDatabase() ? "connected" : "memory_only",
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(200).json({
        ok: false,
        error: error?.message || "路由矩阵暂时不可用",
        routes: [],
        failures: [],
        performance: {},
        database: hasDatabase() ? "connected" : "memory_only",
        updatedAt: new Date().toISOString(),
      });
    }
  }

  if (req.method === "POST") {
    const body = parseBody(req.body);
    try {
      if (body.action === "seed") {
        const channel = await seedRouteChannel(body);
        return res.status(200).json({ ok: true, channel });
      }
      if (body.action === "update-channel") {
        const channel = await updateRouteChannel(body.id, {
          isEnabled: body.isEnabled,
          priority: body.priority,
          qualityScore: body.qualityScore,
          routeStrategy: body.routeStrategy,
        });
        if (!channel) return res.status(404).json({ ok: false, error: "渠道不存在或数据库未配置" });
        return res.status(200).json({ ok: true, channel });
      }
      if (body.action === "invalidate") {
        invalidateRouteCaches(body.publicModelId || "");
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ ok: false, error: "未知操作" });
    } catch (error) {
      return res.status(error.status || 500).json({ ok: false, error: error.message || "路由配置失败" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
