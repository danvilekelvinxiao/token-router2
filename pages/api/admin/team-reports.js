import { requireAdmin } from "@/lib/admin-auth";
import { generateTeamDailyReports, listTeamDailyReports } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  const teamId = String(req.query.teamId || "");

  try {
    if (req.method === "POST") {
      return res.status(200).json({ ok: true, reports: await generateTeamDailyReports(date) });
    }
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, reports: await listTeamDailyReports({ date, teamId }) });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "团队报表生成失败" });
  }
}
