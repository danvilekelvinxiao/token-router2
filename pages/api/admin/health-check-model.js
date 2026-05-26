/**
 * POST /api/admin/health-check-model
 * Admin-only: runs a real health check against UniAPI for a specific model.
 * Sends POST /v1/chat/completions with { model, messages: [{role:"user",content:"ping"}], max_tokens:5 }
 * Only marks model as available if 200 + valid response.
 */
import { requireAdmin } from "@/lib/admin-auth";
import { getModelProduct } from "@/lib/model-products";
import { updateModelConfig } from "@/lib/model-store";

const UNIAPI_API_KEY = process.env.UNIAPI_API_KEY || "";
const UNIAPI_BASE_URL = "https://api.uniapi.io";

function isUsableKey(key) {
  const value = String(key || "").trim();
  return value.length > 20 && !value.includes("请填入");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { modelId, actualModelId: inputActualId } = req.body || {};

  const product = modelId ? getModelProduct(modelId) : null;
  const actualModelId = inputActualId || product?.actualModelId;

  if (!actualModelId || String(actualModelId).trim() === "") {
    return res.status(400).json({
      ok: false,
      error: "缺少 actual_model_id，无法执行健康检查。",
      suggestion: "请先在模型配置中设置 actual_model_id 或通过 UniAPI 同步获取。",
    });
  }

  if (!isUsableKey(UNIAPI_API_KEY)) {
    return res.status(400).json({
      ok: false,
      error: "UNIAPI_API_KEY 未配置，无法执行真实健康检查。",
    });
  }

  const startMs = Date.now();
  let statusCode = 0;
  let responseBody = null;
  let errorMessage = "";

  try {
    const response = await fetch(`${UNIAPI_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UNIAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: actualModelId,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(20000),
    });

    statusCode = response.status;
    const text = await response.text();

    try {
      responseBody = JSON.parse(text);
    } catch {
      responseBody = { raw: text.slice(0, 500) };
    }

    const hasValidContent =
      response.ok &&
      (responseBody?.choices?.length > 0 ||
        responseBody?.content ||
        (responseBody?.usage && responseBody.usage.total_tokens > 0));

    const now = new Date().toISOString();

    if (hasValidContent) {
      if (product) {
        await updateModelConfig(product.id, {
          isAvailable: true,
          status: "available",
          statusLabel: "可用",
          lastHealthCheckAt: now,
          lastError: null,
        });
      }

      return res.status(200).json({
        ok: true,
        modelId: product?.publicModelId || actualModelId,
        actualModelId,
        status: "available",
        statusLabel: "可用",
        latencyMs: Date.now() - startMs,
        upstreamStatus: statusCode,
        lastHealthCheckAt: now,
      });
    }

    const errMsg =
      responseBody?.error?.message ||
      responseBody?.error?.code ||
      responseBody?.error ||
      `上游返回 ${statusCode}`;

    errorMessage = typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg);

    if (product) {
      await updateModelConfig(product.id, {
        isAvailable: false,
        status: "unavailable",
        statusLabel: "暂不可用",
        lastHealthCheckAt: new Date().toISOString(),
        lastError: errorMessage,
      });
    }
  } catch (error) {
    errorMessage = error.name === "AbortError" ? "健康检查超时 (20s)" : error.message || String(error);
    statusCode = 0;

    if (product) {
      await updateModelConfig(product.id, {
        isAvailable: false,
        status: "unavailable",
        statusLabel: "暂不可用",
        lastHealthCheckAt: new Date().toISOString(),
        lastError: errorMessage,
      });
    }
  }

  return res.status(200).json({
    ok: false,
    modelId: product?.publicModelId || actualModelId,
    actualModelId,
    status: "unavailable",
    statusLabel: "暂不可用",
    latencyMs: Date.now() - startMs,
    upstreamStatus: statusCode,
    error: errorMessage,
    lastHealthCheckAt: new Date().toISOString(),
  });
}
