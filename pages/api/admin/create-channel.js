import { requireAdmin } from "@/lib/admin-auth";
import { getNewApiAdminHeaders } from "@/lib/new-api/admin-auth.mjs";

const NEW_API_BASE = process.env.NEW_API_BASE_URL || "http://127.0.0.1:8080";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { name, models, group, baseUrl, key, type } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });

  const adminHeaders = await getNewApiAdminHeaders();
  if (!adminHeaders) {
    return res.status(500).json({
      error: "NEW_API_ADMIN_TOKEN / NEW_API_ADMIN_ACCOUNT / NEW_API_ADMIN_PASSWORD 未配置，无法创建 New API 渠道。",
    });
  }

  try {
    const r = await fetch(`${NEW_API_BASE.replace(/\/+$/, "")}/api/channel/`, {
      method: "POST",
      headers: {
        ...adminHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: type || 1,
        name,
        models: models || name,
        group: group || "default",
        status: 1,
        base_url: baseUrl || "",
        key: key || "",
      }),
    });
    const data = await r.json();
    return res.status(r.ok ? 200 : 500).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
