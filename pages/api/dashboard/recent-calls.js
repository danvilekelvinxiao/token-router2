import { getDashboard } from "@/lib/customer-store";
import { buildRecentCalls } from "@/lib/dashboard-metrics";
import { requireCustomerSession } from "@/lib/session";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const customer = await getDashboard(session.customerId);
  if (!customer) return res.status(404).json({ error: "用户不存在" });

  return res.status(200).json(buildRecentCalls(customer, req.query.limit || 5));
}
