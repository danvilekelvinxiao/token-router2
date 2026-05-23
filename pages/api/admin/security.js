import {
  listBlacklist, addBlacklist, removeBlacklist,
  listRiskRules, saveRiskRule, deleteRiskRule,
  listRiskEvents, updateRiskEvent,
  ensureAdminSchema,
} from "@/lib/admin-store";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  await ensureAdminSchema();

  if (req.method === "GET") {
    const result = {
      blacklist: await listBlacklist(),
      riskRules: await listRiskRules(),
      riskEvents: await listRiskEvents(),
    };
    return res.status(200).json(result);
  }

  if (req.method === "POST") {
    const { action, data } = req.body || {};
    if (action === "addBlacklist") {
      const entry = await addBlacklist(data);
      return res.status(200).json({ ok: true, entry });
    }
    if (action === "removeBlacklist") {
      await removeBlacklist(data.id);
      return res.status(200).json({ ok: true });
    }
    if (action === "saveRiskRule") {
      const rule = await saveRiskRule(data);
      return res.status(200).json({ ok: true, rule });
    }
    if (action === "deleteRiskRule") {
      await deleteRiskRule(data.id);
      return res.status(200).json({ ok: true });
    }
    if (action === "updateRiskEvent") {
      const event = await updateRiskEvent(data.id, data.updates);
      return res.status(200).json({ ok: true, event });
    }
    return res.status(400).json({ error: "Unknown action" });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
