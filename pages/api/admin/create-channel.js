import { requireAdmin } from "@/lib/admin-auth";
import { resolveNewApiBaseUrl, resolveNewApiAdminToken } from "@/lib/new-api/runtime";

const NEW_API_BASE = resolveNewApiBaseUrl();
const ADMIN = resolveNewApiAdminToken();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (!NEW_API_BASE) {
    return res.status(500).json({ error: "NEW_API_BASE_URL 未配置" });
  }
  if (!ADMIN) {
    return res.status(500).json({ error: "NEW_API_ADMIN_TOKEN 或 SUB2API_ADMIN_TOKEN 未配置" });
  }

  const { name, models, group, baseUrl, key, type } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });

  try {
    const r = await fetch(`${NEW_API_BASE.replace(/\/+$/, "")}/api/channel/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ADMIN}`,
        "New-Api-User": process.env.NEW_API_ADMIN_USER_ID || "1",
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
