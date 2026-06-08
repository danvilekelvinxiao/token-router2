import { checkUpstreamHealth } from "@/lib/upstream";

function publicHealthPayload(health = {}) {
  return {
    ok: Boolean(health.ok),
    service: "flowapi",
    modelService: health.ok ? "ok" : "degraded",
    serviceStatus: health.ok ? "ok" : "degraded",
    message: health.ok ? "FlowAPI 模型服务可用" : "FlowAPI 模型服务暂时不可用",
    suggestion: health.ok
      ? "至少一个模型服务通道正常，正式调用可继续使用。"
      : "请稍后重试；如果持续失败，请联系 FlowAPI 客服并提供 Request ID。",
    time: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  if (req.method === "HEAD") {
    const health = await checkUpstreamHealth({ timeoutMs: 4000 });
    return res.status(health.ok ? 200 : 500).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({
      code: "METHOD_NOT_ALLOWED",
      error: "Method not allowed",
      suggestion: "请使用 GET 请求检测 FlowAPI 模型服务健康状态。",
    });
  }

  const health = await checkUpstreamHealth({ timeoutMs: 5000 });
  return res.status(health.ok ? 200 : 500).json(publicHealthPayload(health));
}
