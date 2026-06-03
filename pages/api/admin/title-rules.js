import { requireAdmin } from "@/lib/admin-auth";
import { listCustomers } from "@/lib/customer-store";
import { listTitleRules, markUserTitlesDirty, recalculateUserTitles, updateTitleRule } from "@/lib/titles/recalculate-user-titles";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method === "GET") {
    const result = await listTitleRules();
    return res.status(200).json({ ok: true, ...result });
  }

  if (req.method === "POST") {
    const { action, ruleKey, patch, userId } = req.body || {};
    if (action === "updateRule") {
      const rule = await updateTitleRule(ruleKey, patch || {});
      if (!rule) return res.status(404).json({ error: "称号规则不存在" });
      return res.status(200).json({ ok: true, rule });
    }
    if (action === "recalculateUser") {
      const result = await recalculateUserTitles(userId);
      if (!result) return res.status(404).json({ error: "用户不存在" });
      return res.status(200).json({ ok: true, result });
    }
    if (action === "recalculateAll") {
      const customers = await listCustomers();
      let count = 0;
      for (const customer of customers || []) {
        await markUserTitlesDirty(customer.id, "admin_recalculate_all");
        await recalculateUserTitles(customer.id);
        count += 1;
      }
      return res.status(200).json({ ok: true, count });
    }
    return res.status(400).json({ error: "Unknown action" });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
