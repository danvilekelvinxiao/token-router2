import { assertCustomerOwner } from "@/lib/session";
import { getUserTeamIds, listTeamUsageLogs } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const session = assertCustomerOwner(req, res, req.query?.customerId || req.body?.customerId);
  if (!session) return;
  const allowedTeamIds = await getUserTeamIds(session.customerId);
  const requestedTeamId = String(req.query.teamId || "");
  const teamId = requestedTeamId && allowedTeamIds.includes(requestedTeamId) ? requestedTeamId : allowedTeamIds[0] || "";
  if (!teamId) return res.status(200).json({ ok: true, logs: [] });
  return res.status(200).json({ ok: true, logs: await listTeamUsageLogs({ teamId, limit: Number(req.query.limit || 100) }) });
}
