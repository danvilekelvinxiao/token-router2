/**
 * POST /api/admin/sync-uniapi-models
 * Admin-only: fetches real model list from UniAPI and syncs to upstream_models store.
 * UniAPI Key is NEVER exposed to the frontend.
 */
import { requireAdmin } from "@/lib/admin-auth";
import { saveUpstreamModels, clearUpstreamModels, listUpstreamModels } from "@/lib/model-store";

const UNIAPI_API_KEY = process.env.UNIAPI_API_KEY || "";
const UNIAPI_BASE_URL = "https://api.uniapi.io";

function isUsableKey(key) {
  const value = String(key || "").trim();
  return value.length > 20 && !value.includes("请填入") && !value.includes("UNIAPI_API_KEY");
}

async function fetchUniApiModels() {
  const url = `${UNIAPI_BASE_URL}/v1/models`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${UNIAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`UniAPI /v1/models 返回 ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const modelList = data?.data || data?.models || data || [];

  if (!Array.isArray(modelList)) {
    throw new Error("UniAPI 返回模型列表格式异常: " + JSON.stringify(data).slice(0, 200));
  }

  return modelList.map((item) => {
    const id = typeof item === "string" ? item : (item.id || item.model || item.name || "");
    const ownedBy = typeof item === "object" ? (item.owned_by || item.provider || "") : "";

    return {
      id: `up_uniapi_${id.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
      provider: ownedBy || detectProviderFromModelId(id),
      upstreamChannel: "uniapi",
      actualModelId: id,
      displayName: typeof item === "object" ? (item.display_name || item.name || id) : id,
      isDetected: true,
    };
  });
}

function detectProviderFromModelId(modelId) {
  const id = String(modelId || "").toLowerCase();
  if (id.includes("gpt") || id.includes("codex") || id.includes("o1") || id.includes("o3") || id.includes("o4")) return "openai";
  if (id.includes("claude")) return "anthropic";
  if (id.includes("gemini")) return "google";
  if (id.includes("deepseek")) return "deepseek";
  if (id.includes("qwen")) return "alibaba";
  return "uniapi";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (!isUsableKey(UNIAPI_API_KEY)) {
    return res.status(400).json({
      ok: false,
      error: "UNIAPI_API_KEY 未配置或仍是占位符。请在服务器 .env 中设置真实 UniAPI Key。",
      suggestion: "UNIAPI_API_KEY=sk-...",
    });
  }

  try {
    const models = await fetchUniApiModels();

    if (models.length === 0) {
      return res.status(200).json({
        ok: true,
        message: "UniAPI 返回了空模型列表",
        models: [],
        added: 0,
        updated: 0,
      });
    }

    await clearUpstreamModels("uniapi");
    await saveUpstreamModels(models);

    const saved = await listUpstreamModels({ channel: "uniapi" });

    return res.status(200).json({
      ok: true,
      message: `成功同步 ${saved.length} 个 UniAPI 上游模型`,
      models: saved.map((m) => ({
        actualModelId: m.actualModelId,
        displayName: m.displayName,
        provider: m.provider,
      })),
      total: saved.length,
    });
  } catch (error) {
    console.error("[sync-uniapi-models]", error);
    return res.status(502).json({
      ok: false,
      error: "UniAPI 模型同步失败",
      detail: error.message || String(error),
    });
  }
}
