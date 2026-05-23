/**
 * GET /api/admin/newapi/health
 * Admin-only: checks connectivity to the upstream New API service.
 */

const NEW_API_ADMIN_URL =
  process.env.NEW_API_ADMIN_URL ||
  process.env.NEW_API_BASE_URL ||
  "http://localhost:3001";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = NEW_API_ADMIN_URL.replace(/\/+$/, "");

  try {
    const start = Date.now();
    const upstream = await fetch(`${url}/api/status`, {
      signal: AbortSignal.timeout(8000),
    });
    const latencyMs = Date.now() - start;

    if (!upstream.ok) {
      return res.status(200).json({
        status: "error",
        url,
        latencyMs,
        message: `New API 返回 ${upstream.status}`,
      });
    }

    const body = await upstream.json().catch(() => null);
    return res.status(200).json({
      status: "ok",
      url,
      latencyMs,
      version: body?.data?.version || body?.version || null,
      uptime: body?.data?.start_time || null,
    });
  } catch {
    return res.status(200).json({
      status: "error",
      url,
      message: "无法连接 New API",
    });
  }
}
