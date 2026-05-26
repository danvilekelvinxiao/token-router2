/**
 * POST /api/connection/test-model
 * Lightweight model connectivity test using FlowAPI's own /v1/chat/completions.
 * Returns user-friendly Chinese messages — never says "API Key invalid" incorrectly.
 */
import { getConnectionTestMessage, getCurlExample } from "@/lib/api/error-message";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { apiKey, model } = req.body || {};

  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({
      success: false,
      status: "config_error",
      message: "API Key 不能为空。请先在 API 管理页创建 API 密匙。",
    });
  }

  if (!model || !model.trim()) {
    return res.status(400).json({
      success: false,
      status: "config_error",
      message: "模型名称不能为空。",
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_FLOWAPI_BASE_URL || "https://api.flowapi.fun/v1";

  try {
    const start = Date.now();
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model.trim(),
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const latencyMs = Date.now() - start;
    const body = await response.json().catch(() => null);

    if (response.ok && body?.choices?.length > 0) {
      return res.status(200).json({
        success: true,
        status: "ok",
        message: "连接成功，该 API Key 可以正常调用模型。",
        model,
        latencyMs,
      });
    }

    // Map error to user-friendly message
    const errorInfo = getConnectionTestMessage(response.status, model);
    return res.status(200).json({
      success: false,
      ...errorInfo,
      code: response.status,
      model,
      latencyMs,
      curlExample: getCurlExample(model),
    });
  } catch (e) {
    if (e.name === "AbortError") {
      return res.status(200).json({
        success: false,
        status: "timeout",
        message: "连接测试超时，可能是网络问题或上游服务响应较慢。请稍后重试。这不代表 API Key 无效。",
        canStillUse: true,
        model,
        curlExample: getCurlExample(model),
      });
    }
    return res.status(200).json({
      success: false,
      status: "unknown_error",
      message: `连接测试失败：${e.message}。这不代表 API Key 无效，请检查网络后重试。`,
      canStillUse: true,
      model,
      curlExample: getCurlExample(model),
    });
  }
}
