import { buildAdminUsageLogs, buildUsageLogs } from "@/lib/usage-log-service";
import { getCustomer } from "@/lib/customer-store";
import { requireCustomerSession } from "@/lib/session";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const session = requireCustomerSession(req, res);
  if (!session) return;

  const viewer = await getCustomer(session.customerId);
  const wantsAdmin = req.query.scope === "admin" || req.query.admin === "1";
  if (wantsAdmin && viewer?.role !== "admin") {
    return res.status(403).json({ error: "只有管理员可以导出全站使用日志" });
  }

  const data = wantsAdmin
    ? await buildAdminUsageLogs({
      filters: req.query || {},
      limit: req.query.limit || 5000,
    })
    : await buildUsageLogs({
    customerId: session.customerId,
    filters: req.query || {},
    limit: req.query.limit || 200,
  });
  return res.status(200).json({ ok: true, ...data });
}
