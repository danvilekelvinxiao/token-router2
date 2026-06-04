import { assertCustomerOwner } from "@/lib/session";
import { getUserTeamIds, listTeamDailyReports } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const session = assertCustomerOwner(req, res, req.query?.customerId || req.body?.customerId);
  if (!session) return;
  const allowedTeamIds = await getUserTeamIds(session.customerId);
  const requestedTeamId = String(req.query.teamId || "");
  const teamId = requestedTeamId && allowedTeamIds.includes(requestedTeamId) ? requestedTeamId : allowedTeamIds[0] || "";
  if (!teamId) return res.status(200).json({ ok: true, reports: [] });
  return res.status(200).json({ ok: true, reports: await listTeamDailyReports({ date: String(req.query.date || ""), teamId }) });
}
