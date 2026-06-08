import { assertCustomerOwner } from "@/lib/session";
import { getUserTeamIds, listTeamDailyReports } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const session = assertCustomerOwner(req, res, req.query?.customerId || req.body?.customerId);
  if (!session) return;
  const allowedTeamIds = await getUserTeamIds(session.customerId);
  const requestedTeamId = String(req.query.teamId || "");
  if (requestedTeamId && !allowedTeamIds.includes(requestedTeamId)) {
    return res.status(403).json({ ok: false, error: "你没有权限查看这个团队报表" });
  }
  const teamId = requestedTeamId || allowedTeamIds[0] || "";
  if (!teamId) return res.status(200).json({ ok: true, reports: [] });
  return res.status(200).json({ ok: true, reports: await listTeamDailyReports({ date: String(req.query.date || ""), teamId }) });
}
