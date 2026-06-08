import { assertCustomerOwner } from "@/lib/session";
import { createTeamForUser } from "@/lib/team-management";

export default async function handler(req, res) {
  const session = assertCustomerOwner(req, res, req.query?.customerId || req.body?.customerId);
  if (!session) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const team = await createTeamForUser(session.customerId, req.body || {});
    return res.status(200).json({ ok: true, team });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || "团队创建失败" });
  }
}
