import { requireAdmin } from "@/lib/admin-auth";
import { listRateLimitRules, upsertRateLimitRule } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, rules: await listRateLimitRules() });
    }
    if (req.method === "POST" || req.method === "PATCH") {
      const rule = await upsertRateLimitRule(req.body || {}, admin.id);
      return res.status(200).json({ ok: true, rule });
    }
    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "限流规则保存失败" });
  }
}
