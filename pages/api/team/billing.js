import { requireCustomerSession } from "@/lib/session";
import { getTeamBillingForUser } from "@/lib/team-management";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const result = await getTeamBillingForUser(session.customerId, String(req.query.teamId || req.query.workspaceId || ""));

  if (result.error) return res.status(403).json({ error: result.error });
  return res.status(200).json({
    ok: true,
    success: true,
    ...result,
  });
}
