import { requireAdmin } from "@/lib/admin-auth";
import { toggleWhitelistToken } from "@/lib/new-api/passthrough";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { id, enabled } = req.body || {};
  if (id == null) return res.status(400).json({ success: false, error: "缺少 id" });

  try {
    const result = await toggleWhitelistToken(id, Boolean(enabled));
    return res.status(200).json({ success: true, token: result });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
