import { requireAdmin } from "@/lib/admin-auth";
import { query } from "@/lib/db";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const userId = String(req.query?.userId || "").trim();
  if (!userId) return res.status(400).json({ error: "缺少 userId" });
  await query("UPDATE wallets SET status = 'active', updated_at = NOW() WHERE user_id = $1", [userId]);
  return res.status(200).json({ ok: true });
}
