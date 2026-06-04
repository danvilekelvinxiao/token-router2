import { requireAdmin } from "@/lib/admin-auth";
import { testTokenPoolToken } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const log = await testTokenPoolToken({ tokenId: String(req.query.id || ""), adminId: admin.id, useRealUpstream: req.body?.useRealUpstream === true });
    return res.status(200).json({ ok: true, log });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Token 测试失败" });
  }
}
