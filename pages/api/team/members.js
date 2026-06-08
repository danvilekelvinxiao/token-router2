import { assertCustomerOwner } from "@/lib/session";
import {
  createTeamInviteForUser,
  listTeamMembersForUser,
  setTeamMemberLimitForUser,
  updateTeamMemberForUser,
} from "@/lib/team-management";

export default async function handler(req, res) {
  const session = assertCustomerOwner(req, res, req.query?.customerId || req.body?.customerId);
  if (!session) return;
  const teamId = String(req.query.teamId || req.body?.teamId || "");

  if (req.method === "GET") {
    const result = await listTeamMembersForUser(session.customerId, teamId);
    if (result.error) return res.status(403).json({ ok: false, error: result.error });
    return res.status(200).json({ ok: true, ...result });
  }

  if (req.method === "POST") {
    const action = String(req.body?.action || "invite");
    if (action === "invite") {
      const result = await createTeamInviteForUser(session.customerId, teamId, req.body || {});
      if (result.error) return res.status(403).json({ ok: false, error: result.error });
      return res.status(200).json({ ok: true, ...result });
    }
    if (action === "set_limit") {
      const result = await setTeamMemberLimitForUser(session.customerId, teamId, String(req.body?.userId || ""), req.body?.limit || req.body || {});
      if (result.error) return res.status(403).json({ ok: false, error: result.error });
      return res.status(200).json({ ok: true, ...result });
    }
    if (action === "update_member") {
      const result = await updateTeamMemberForUser(session.customerId, teamId, String(req.body?.userId || ""), req.body || {});
      if (result.error) return res.status(403).json({ ok: false, error: result.error });
      return res.status(200).json({ ok: true, ...result });
    }
    return res.status(400).json({ ok: false, error: "不支持的团队成员操作" });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
