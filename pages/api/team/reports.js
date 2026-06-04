import { assertCustomerOwner } from "@/lib/session";
import { listTeamDailyReports } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const session = assertCustomerOwner(req, res, req.query?.customerId || req.body?.customerId);
  if (!session) return;
  const teamId = String(req.query.teamId || "");
  return res.status(200).json({ ok: true, reports: await listTeamDailyReports({ date: String(req.query.date || ""), teamId }) });
}
