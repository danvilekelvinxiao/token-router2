import { requireAdmin } from "@/lib/admin-auth";
import { getUpstreamConfigs } from "@/lib/upstream";
import { updateModelConfig } from "@/lib/model-store";
import { getModelProductWithConfig } from "@/lib/model-products-server";

async function updateModelConfigAliases(publicModelId, updates) {
  const product = await getModelProductWithConfig(publicModelId);
  const aliases = [
    publicModelId,
    product?.id,
    product?.publicModelId,
    product?.actualModelId,
  ].filter(Boolean);

  for (const alias of [...new Set(aliases)]) {
    await updateModelConfig(alias, updates);
  }
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const publicModelId = String(req.query.id || "").trim();
  const actualModelId = String(req.body?.actualModelId || req.body?.upstreamModelId || publicModelId).trim();
  if (!actualModelId) return res.status(400).json({ ok: false, error: "缺少上游模型 ID" });

  const upstream = getUpstreamConfigs().find((item) => item.apiKey && item.upstreamUrl);
  if (!upstream) {
    return res.status(400).json({
      ok: false,
      error: "服务器还没有配置可用于测试的上游通道",
      suggestion: "请先配置 NEW_API_BASE_URL + NEW_API_KEY，或 OPENROUTER_API_KEY。",
    });
  }

  const started = Date.now();
  try {
    const response = await fetch(upstream.upstreamUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstream.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: actualModelId,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 6,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    const ok = response.ok && (json?.choices?.length || json?.usage || json?.content);
    const result = {
      ok: Boolean(ok),
      modelId: publicModelId,
      actualModelId,
      upstream: upstream.label,
      latencyMs: Date.now() - started,
      statusCode: response.status,
      error: ok ? "" : (json?.error?.message || json?.error || text.slice(0, 220) || `HTTP ${response.status}`),
    };
    await updateModelConfigAliases(publicModelId, {
      actualModelId,
      lastHealthCheckAt: new Date().toISOString(),
      lastError: result.ok ? "" : result.error,
      status: result.ok ? "available" : "unavailable",
      statusLabel: result.ok ? "可用" : "暂不可用",
      isAvailable: result.ok,
    });
    return res.status(200).json(result);
  } catch (error) {
    const result = {
      ok: false,
      modelId: publicModelId,
      actualModelId,
      upstream: upstream.label,
      latencyMs: Date.now() - started,
      statusCode: 0,
      error: error.name === "AbortError" ? "模型测试超时，请稍后重试或检查上游渠道。" : error.message || "模型测试失败",
    };
    await updateModelConfigAliases(publicModelId, {
      actualModelId,
      lastHealthCheckAt: new Date().toISOString(),
      lastError: result.error,
      status: "unavailable",
      statusLabel: "暂不可用",
      isAvailable: false,
    });
    return res.status(200).json(result);
  }
}
