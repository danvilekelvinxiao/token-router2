import { requireAdmin } from "@/lib/admin-auth";
import { getRechargeOrderById } from "@/lib/customer-store";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const order = await getRechargeOrderById(String(req.query?.id || "").trim());
  if (!order) return res.status(404).json({ error: "订单不存在" });
  return res.status(200).json({ order });
}
