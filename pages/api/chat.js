import { findCustomerByToken } from "@/lib/customer-store";

const MODEL_MAP = {
  DeepSeek: "deepseek-chat",
  Qwen: "qwen/qwen3-32b",
  "GPT-4o": "openai/gpt-4o-mini",
};

function getClientToken(req) {
  const auth = req.headers.authorization || "";
  let token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : String(req.headers["x-api-key"] || "").trim();
  while (token.toLowerCase().startsWith("bearer ")) token = token.slice(7).trim();
  return token.replace(/^["']|["']$/g, "");
}

function getInternalChatUrl(req) {
  const configured = process.env.INTERNAL_FLOWAPI_BASE_URL?.replace(/\/+$/, "");
  if (configured) return `${configured}/api/v1/chat/completions`;
  const host = req.headers.host || "localhost:3000";
  const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}/api/v1/chat/completions`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "只支持 POST 请求" });
  }

  const prompt = req.body?.prompt?.trim();
  const selectedModel = req.body?.model;

  if (!prompt) {
    return res.status(400).json({ error: "请输入问题" });
  }

  if (!selectedModel || !MODEL_MAP[selectedModel]) {
    return res.status(400).json({ error: "模型参数无效" });
  }

  const clientToken = getClientToken(req);
  if (!clientToken || !(await findCustomerByToken(clientToken))) {
    return res.status(401).json({
      error: {
        message: "Invalid FlowAPI API Key",
        type: "invalid_api_key",
      },
    });
  }

  try {
    const response = await fetch(getInternalChatUrl(req), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clientToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_MAP[selectedModel],
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "上游模型服务请求失败，请稍后重试。",
      });
    }

    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({ error: "上游模型服务没有返回有效内容，请稍后重试。" });
    }

    return res.status(200).json({ content });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "服务暂时不可用",
    });
  }
}
