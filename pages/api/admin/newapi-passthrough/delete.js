import { requireAdmin } from "@/lib/admin-auth";
import { deleteWhitelistToken } from "@/lib/new-api/passthrough";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { id } = req.body || {};
  if (id == null) return res.status(400).json({ success: false, error: "缺少 id" });

  try {
    await deleteWhitelistToken(id);
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
