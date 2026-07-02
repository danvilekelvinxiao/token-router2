import { approveRechargeOrder, listRechargeOrders, rejectRechargeOrder } from "@/lib/wallet/service";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method === "GET") {
    const orders = await listRechargeOrders({ status: String(req.query?.status || ""), limit: Number(req.query?.limit || 100) });
    return res.status(200).json({ orders });
  }

  if (req.method === "POST") {
    const { orderId, action = "approve", reason = "" } = req.body || {};
    if (!orderId) return res.status(400).json({ error: "缺少 orderId" });
    if (action === "approve") {
      const result = await approveRechargeOrder({ orderId, reviewedBy: "admin" });
      if (result.error) return res.status(400).json({ error: result.error });
      return res.status(200).json({ ok: true, ...result });
    }
    if (action === "reject") {
      const result = await rejectRechargeOrder({ orderId, reviewedBy: "admin", reason });
      if (result.error) return res.status(400).json({ error: result.error });
      return res.status(200).json({ ok: true, ...result });
    }
    return res.status(400).json({ error: "Unsupported action" });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
