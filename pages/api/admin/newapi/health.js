/**
 * GET /api/admin/newapi/health
 * Admin-only: checks connectivity to the upstream New API service.
 */

import { requireAdmin } from "@/lib/admin-auth";
import { resolveNewApiAdminAuth } from "@/lib/new-api/admin-auth.mjs";

const NEW_API_ADMIN_URL =
  String(process.env.NEW_API_ADMIN_URL || "").trim();
const ENABLE_PROXY = String(process.env.FLOWAPI_ENABLE_NEWAPI_ADMIN_PROXY || "false").trim() === "true";
const NEW_API_PROXY_TARGET =
  ENABLE_PROXY
    ? String(process.env.NEW_API_ADMIN_URL || process.env.NEW_API_BASE_URL || "").trim()
    : NEW_API_ADMIN_URL;
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await requireAdmin(req, res))) return;

  const url = String(NEW_API_PROXY_TARGET || "").replace(/\/+$/, "");

  if (!url) {
    return res.status(200).json({
      status: "error",
      message: "未配置 NEW_API_ADMIN_URL",
      proxyEnabled: ENABLE_PROXY,
    });
  }

  try {
    const start = Date.now();
    const adminAuth = await resolveNewApiAdminAuth();
    const runtimeKey =
      process.env.NEW_API_KEY ||
      process.env.NEW_API_KEY_ALL_MODELS ||
      adminAuth.token ||
      "";
    if (!runtimeKey) {
      return res.status(200).json({
        status: "error",
        url,
        message: "NEW_API_KEY / NEW_API_ADMIN_TOKEN / NEW_API_ADMIN_ACCOUNT 未配置",
        proxyEnabled: ENABLE_PROXY,
      });
    }
    let upstream = await fetch(`${url}/v1/models`, {
      headers: {
        Authorization: `Bearer ${runtimeKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    const latencyMs = Date.now() - start;

    if (!upstream.ok && adminAuth.token && adminAuth.token !== runtimeKey) {
      upstream = await fetch(`${url}/v1/models`, {
        headers: {
          Authorization: `Bearer ${adminAuth.token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(8000),
      });
    }

    if (!upstream.ok) {
      return res.status(200).json({
        status: "error",
        url,
        latencyMs,
        message: `New API 返回 ${upstream.status}`,
        proxyEnabled: ENABLE_PROXY,
      });
    }

    const body = await upstream.json().catch(() => null);
    return res.status(200).json({
      status: "ok",
      url,
      latencyMs,
      modelCount: Array.isArray(body?.data) ? body.data.length : null,
      proxyEnabled: ENABLE_PROXY,
    });
  } catch {
    return res.status(200).json({
      status: "error",
      url,
      message: "无法连接 New API",
      proxyEnabled: ENABLE_PROXY,
    });
  }
}
