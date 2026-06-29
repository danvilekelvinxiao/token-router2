import { approveRechargeOrder, listRechargeOrders } from "@/lib/customer-store";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const orders = await listRechargeOrders({
        status: req.query?.status || "",
        limit: Number(req.query?.limit || 120),
      });
      return res.status(200).json({ ok: true, orders });
    }

    if (req.method === "POST") {
      const { orderId, action = "approve" } = req.body || {};
      if (action !== "approve") return res.status(400).json({ ok: false, code: "UNSUPPORTED_ACTION", message: "不支持的操作" });
      const result = await approveRechargeOrder({ orderId, approvedBy: admin.customer?.id || admin.session?.customerId || "admin" });
      if (result.error) return res.status(400).json({ ok: false, code: "RECHARGE_APPROVE_FAILED", message: result.error });
      return res.status(200).json({ ok: true, message: "充值订单已处理", ...result });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" });
  } catch (error) {
    console.error("[admin] recharge operation failed:", error);
    return res.status(500).json({ ok: false, code: "ADMIN_RECHARGE_ERROR", message: "充值操作失败，请检查内容后重试。" });
  }
}
