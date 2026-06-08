import { assertCustomerOwner } from "@/lib/session";
import { listTeamsForUser } from "@/lib/team-management";

export default async function handler(req, res) {
  const session = assertCustomerOwner(req, res, req.query?.customerId || req.body?.customerId);
  if (!session) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  return res.status(200).json({ ok: true, teams: await listTeamsForUser(session.customerId) });
}
