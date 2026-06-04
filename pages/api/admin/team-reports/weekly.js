import { requireAdmin } from "@/lib/admin-auth";
import { generateWeeklyTeamReport } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  return res.status(200).json({ ok: true, ...(await generateWeeklyTeamReport({ adminId: admin.id })) });
}
