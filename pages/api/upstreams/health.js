import { checkUpstreamHealth, toPublicUpstreamHealth } from "@/lib/upstream";

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
      suggestion: "请使用 GET 请求检测上游 API 健康状态。",
    });
  }

  const health = await checkUpstreamHealth({ timeoutMs: 5000 });
  return res.status(health.ok ? 200 : 500).json(toPublicUpstreamHealth(health));
}
