import { assertCustomerOwner } from "@/lib/session";
import { joinTeamByInvite } from "@/lib/team-management";

export default async function handler(req, res) {
  const session = assertCustomerOwner(req, res, req.query?.customerId || req.body?.customerId);
  if (!session) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const result = await joinTeamByInvite(session.customerId, req.body?.inviteCode || req.body?.code || "");
  if (result.error) return res.status(400).json({ ok: false, error: result.error });
  return res.status(200).json({ ok: true, ...result });
}
