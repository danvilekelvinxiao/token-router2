import { requireAdmin } from "@/lib/admin-auth";

const NEW_API_BASE = process.env.NEW_API_BASE_URL || "http://localhost:3001";
const NEW_API_ADMIN_TOKEN = process.env.NEW_API_ADMIN_TOKEN || process.env.NEW_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

function isUsableOpenAiKey(key) {
  const value = String(key || "").trim();
  return value.startsWith("sk-") && !value.includes("请填入") && value.length > 20;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (!NEW_API_ADMIN_TOKEN) {
    return res.status(500).json({
      error: "NEW_API_ADMIN_TOKEN 未配置，无法创建 New API 渠道。",
    });
  }

  if (!isUsableOpenAiKey(OPENAI_API_KEY)) {
    return res.status(400).json({
      error: "OPENAI_API_KEY 未配置或仍是占位符。",
      suggestion: "请在服务器环境变量或 New API 渠道后台填入新的 OpenAI API Key。不要把 Key 写进代码或前端。",
      placeholder: "OPENAI_API_KEY=请填入新的 OpenAI API Key",
    });
  }

  const actualModel =
    process.env.FLOWAPI_CODEX_PLUS_ACTUAL_MODEL ||
    process.env.NEXT_PUBLIC_CODEX_PLUS_ACTUAL_MODEL ||
    "gpt-5.5";

  const models = [
    actualModel,
    "gpt-5.5",
    "gpt-5.3-codex",
    "gpt-5.4",
    "gpt-5.4-pro",
  ].filter((value, index, array) => value && array.indexOf(value) === index);

  try {
    const response = await fetch(`${NEW_API_BASE.replace(/\/+$/, "")}/api/channel/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NEW_API_ADMIN_TOKEN}`,
        "New-Api-User": "1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: 1,
        name: "OpenAI-Codex",
        key: OPENAI_API_KEY,
        base_url: "",
        models: models.join(","),
        group: "codex-plus",
        status: 1,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success === false) {
      return res.status(response.status || 502).json({
        error: data?.message || data?.error || "New API OpenAI-Codex 渠道创建失败。",
        detail: data || null,
      });
    }

    return res.status(200).json({
      ok: true,
      channel: "OpenAI-Codex",
      group: "codex-plus",
      models,
      message: "OpenAI-Codex 渠道已提交到 New API。请在 New API 后台执行渠道测试，测试成功后再开启 GPT-5.3-Codex。",
    });
  } catch (error) {
    return res.status(502).json({
      error: "无法连接 New API 渠道管理接口。",
      detail: error?.message || String(error),
    });
  }
}
