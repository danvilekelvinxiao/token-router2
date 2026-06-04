import { requireAdmin } from "@/lib/admin-auth";
import { listTeams, upsertTeam } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, teams: await listTeams() });
    }
    if (req.method === "POST" || req.method === "PATCH") {
      const team = await upsertTeam(req.body || {}, admin.id);
      return res.status(200).json({ ok: true, team });
    }
    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "团队保存失败" });
  }
}
