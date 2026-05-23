import { getDashboard, rechargeCustomer } from "@/lib/customer-store";
import { requireAdmin } from "@/lib/admin-auth";
import { assertCustomerOwner } from "@/lib/session";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const requestedCustomerId = req.query.customerId;
    const session = assertCustomerOwner(req, res, requestedCustomerId);
    if (!session) return;
    const customer = await getDashboard(requestedCustomerId || session.customerId);
    if (!customer) return res.status(404).json({ error: "用户不存在或服务实例已重启" });
    return res.status(200).json(customer);
  }

  if (req.method === "POST") {
    if (!(await requireAdmin(req, res))) return;
    return res.status(200).json(await rechargeCustomer(req.body?.customerId, req.body?.amount));
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
