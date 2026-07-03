import { requireAdmin } from "@/lib/admin-auth";
import { getNewApiAdminHeaders } from "@/lib/new-api/admin-auth.mjs";

const NEW_API_BASE = process.env.NEW_API_BASE_URL || "http://127.0.0.1:8080";
const UNIAPI_API_KEY = process.env.UNIAPI_API_KEY || "";
const UNIAPI_BASE_URL = "https://api.uniapi.io";

const DEFAULT_UNIAPI_MODELS = [
  "gpt-5.5",
  "gpt-5.4-pro",
  "gpt-5.4",
  "gpt-5.3-codex",
  "gpt-5.2-codex",
];

function isUsableUniApiKey(key) {
  const value = String(key || "").trim();
  return value.length > 20 && !value.includes("请填入") && !value.includes("UNIAPI_API_KEY");
}

function getConfiguredModels() {
  const raw = process.env.UNIAPI_MODELS || "";
  const models = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return models.length ? models : DEFAULT_UNIAPI_MODELS;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const adminHeaders = await getNewApiAdminHeaders();
  if (!adminHeaders) {
    return res.status(500).json({
      error: "NEW_API_ADMIN_TOKEN / NEW_API_ADMIN_ACCOUNT / NEW_API_ADMIN_PASSWORD 未配置，无法创建 New API 渠道。",
    });
  }

  if (!isUsableUniApiKey(UNIAPI_API_KEY)) {
    return res.status(400).json({
      error: "UNIAPI_API_KEY 未配置或仍是占位符。",
      suggestion: "请在服务器环境变量或 New API 渠道后台填写真实 UniAPI Key。不要把 UniAPI Key 写进代码、前端、README 或日志。",
      placeholder: "UNIAPI_API_KEY=请在服务器或 New API 后台填写真实 UniAPI Key",
    });
  }

  const models = getConfiguredModels();

  try {
    const response = await fetch(`${NEW_API_BASE.replace(/\/+$/, "")}/api/channel/`, {
      method: "POST",
      headers: {
        ...adminHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: 1,
        name: "UniAPI-Codex-GPT",
        key: UNIAPI_API_KEY,
        base_url: UNIAPI_BASE_URL,
        models: models.join(","),
        group: "codex-plus,gpt-premium,default",
        status: 1,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success === false) {
      return res.status(response.status || 502).json({
        error: data?.message || data?.error || "New API UniAPI-Codex-GPT 渠道创建失败。",
        detail: data || null,
      });
    }

    return res.status(200).json({
      ok: true,
      channel: "UniAPI-Codex-GPT",
      baseUrl: UNIAPI_BASE_URL,
      group: "codex-plus,gpt-premium,default",
      models,
      message: "UniAPI-Codex-GPT 渠道已提交到 New API。请在 New API 后台执行渠道测试，测试成功后再开启对应 FlowAPI 模型。",
    });
  } catch (error) {
    return res.status(502).json({
      error: "无法连接 New API 渠道管理接口。",
      detail: error?.message || String(error),
    });
  }
}
