import { requireCustomerSession } from "@/lib/session";
import { getTeamBillingForUser } from "@/lib/team-management";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const data = await getTeamBillingForUser(session.customerId, String(req.query.teamId || req.query.workspaceId || ""));
  if (data.error) return res.status(403).json({ ok: false, error: data.error });
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
  return res.status(200).json({
    ok: true,
    team: data.team,
    role: data.role,
    canViewAll: data.canViewAll,
    logs: (data.logs || []).slice(0, limit),
  });
}
