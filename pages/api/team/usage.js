import { assertCustomerOwner } from "@/lib/session";
import { getTeamOverviewForUser } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const session = assertCustomerOwner(req, res, req.query?.customerId || req.body?.customerId);
  if (!session) return;
  const teamId = String(req.query.teamId || "");
  const overview = await getTeamOverviewForUser(session.customerId, teamId);
  if (overview?.error) {
    return res.status(403).json({ ok: false, error: overview.error });
  }
  return res.status(200).json({
    ok: true,
    metrics: overview.metrics,
    quotaPools: overview.tokens,
    tokens: overview.tokens,
    logs: overview.logs,
  });
}
