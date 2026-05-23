import {
  getBillingConfig, saveBillingConfig,
  listModelPrices, saveModelPrices,
  listAlertRules, saveAlertRule, deleteAlertRule,
  ensureAdminSchema,
} from "@/lib/admin-store";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  await ensureAdminSchema();

  if (req.method === "GET") {
    const type = req.query?.type || "all";
    const result = {};
    if (type === "all" || type === "config") result.config = await getBillingConfig();
    if (type === "all" || type === "prices") result.prices = await listModelPrices();
    if (type === "all" || type === "alerts") result.alerts = await listAlertRules();
    return res.status(200).json(result);
  }

  if (req.method === "POST") {
    const { action, data } = req.body || {};
    if (action === "saveConfig") {
      await saveBillingConfig(data);
      return res.status(200).json({ ok: true });
    }
    if (action === "savePrices") {
      await saveModelPrices(data);
      return res.status(200).json({ ok: true });
    }
    if (action === "saveAlert") {
      const rule = await saveAlertRule(data);
      return res.status(200).json({ ok: true, rule });
    }
    if (action === "deleteAlert") {
      await deleteAlertRule(data.id);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Unknown action" });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
