import { requireAdmin } from "@/lib/admin-auth";
import { sanitizeSecretText } from "@/lib/safe-upstream-url";

const NEW_API_BASE = process.env.NEW_API_ADMIN_URL || process.env.NEW_API_BASE_URL || "http://127.0.0.1:8080";
const NEW_API_ADMIN_TOKEN = process.env.NEW_API_ADMIN_TOKEN || process.env.NEW_API_KEY || "";
const ALLOWED_RESOURCES = new Set(["channel", "token", "log", "group", "option", "status"]);

function buildQuery(req) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === "path") continue;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (value != null) {
      params.append(key, value);
    }
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function buildBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  if (req.body == null || req.body === "") return undefined;
  if (typeof req.body === "string" || Buffer.isBuffer(req.body)) return req.body;
  return JSON.stringify(req.body);
}

export async function proxyNewApiAdmin(req, res, resource) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (!ALLOWED_RESOURCES.has(resource)) {
    return res.status(404).json({ error: "New API 管理资源不存在" });
  }

  const path = Array.isArray(req.query.path) ? req.query.path.join("/") : "";
  const suffix = path ? `/${path}` : "";
  const target = `${NEW_API_BASE.replace(/\/+$/, "")}/api/${resource}${suffix}${buildQuery(req)}`;

  const requestContentType = Array.isArray(req.headers["content-type"])
    ? req.headers["content-type"][0]
    : req.headers["content-type"];
  const headers = {
    "Content-Type": requestContentType || "application/json",
  };
  if (NEW_API_ADMIN_TOKEN) {
    headers.Authorization = `Bearer ${NEW_API_ADMIN_TOKEN}`;
  } else if (resource !== "status") {
    return res.status(500).json({
      error: "New API 管理 Token 未配置",
      suggestion: "请在服务器环境变量配置 NEW_API_ADMIN_TOKEN，禁止从浏览器转发管理员 Cookie 或 Authorization。",
    });
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: buildBody(req),
    });

    const contentType = upstream.headers.get("content-type") || "application/json";
    res.status(upstream.status);
    if (contentType) res.setHeader("Content-Type", contentType);

    const text = sanitizeSecretText(await upstream.text());
    return res.send(text);
  } catch (error) {
    return res.status(502).json({
      error: "New API 管理接口暂时不可用",
      detail: sanitizeSecretText(error?.message || String(error)),
    });
  }
}
