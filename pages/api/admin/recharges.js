import { approveRechargeOrder, listRechargeOrders } from "@/lib/customer-store";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method === "GET") {
    const orders = await listRechargeOrders({
      status: req.query?.status || "",
      limit: Number(req.query?.limit || 120),
    });
    return res.status(200).json({ orders });
  }

  if (req.method === "POST") {
    const { orderId, action = "approve" } = req.body || {};
    if (action !== "approve") return res.status(400).json({ error: "Unsupported action" });
    const result = await approveRechargeOrder({ orderId, approvedBy: "admin" });
    if (result.error) return res.status(400).json({ error: result.error });
    return res.status(200).json({ ok: true, ...result });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
