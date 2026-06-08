import { assertCustomerOwner } from "@/lib/session";
import { getTeamDashboardForUser } from "@/lib/team-management";

export default async function handler(req, res) {
  const session = assertCustomerOwner(req, res, req.query?.customerId || req.body?.customerId);
  if (!session) return;
  const teamId = String(req.query.teamId || "");
  const result = await getTeamDashboardForUser(session.customerId, teamId);
  if (result.error) return res.status(403).json({ ok: false, error: result.error });
  return res.status(200).json({ ok: true, ...result });
}
