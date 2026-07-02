/**
 * GET /api/admin/newapi/health
 * Admin-only: checks connectivity to the upstream New API service.
 */

import { requireAdmin } from "@/lib/admin-auth";

const NEW_API_ADMIN_URL =
  process.env.NEW_API_ADMIN_URL ||
  process.env.NEW_API_BASE_URL ||
  "http://127.0.0.1:8080";
const NEW_API_RUNTIME_KEY =
  process.env.NEW_API_KEY ||
  process.env.NEW_API_KEY_ALL_MODELS ||
  process.env.NEW_API_ADMIN_TOKEN ||
  "";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await requireAdmin(req, res))) return;

  const url = NEW_API_ADMIN_URL.replace(/\/+$/, "");

  try {
    const start = Date.now();
    if (!NEW_API_RUNTIME_KEY) {
      return res.status(200).json({
        status: "error",
        url,
        message: "NEW_API_KEY 未配置",
      });
    }
    const upstream = await fetch(`${url}/v1/models`, {
      headers: {
        Authorization: `Bearer ${NEW_API_RUNTIME_KEY}`,
        "Content-Type": "application/json",
      },
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
      modelCount: Array.isArray(body?.data) ? body.data.length : null,
    });
  } catch {
    return res.status(200).json({
      status: "error",
      url,
      message: "无法连接 New API",
    });
  }
}
