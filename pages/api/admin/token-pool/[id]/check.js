import { requireAdmin } from "@/lib/admin-auth";
import { checkTokenPoolStatus } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const token = await checkTokenPoolStatus(String(req.query.id || ""), admin.id);
    return res.status(200).json({ ok: true, token });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Token 状态检测失败" });
  }
}
