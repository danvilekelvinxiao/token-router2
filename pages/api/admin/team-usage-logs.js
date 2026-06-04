import { requireAdmin } from "@/lib/admin-auth";
import { listTeamUsageLogs } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const teamId = String(req.query.teamId || "");
  const limit = Number(req.query.limit || 100);
  return res.status(200).json({ ok: true, logs: await listTeamUsageLogs({ teamId, limit }) });
}
