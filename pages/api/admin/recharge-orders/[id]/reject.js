import { requireAdmin } from "@/lib/admin-auth";
import { rejectRechargeOrder } from "@/lib/wallet/service";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const result = await rejectRechargeOrder({
    orderId: String(req.query?.id || "").trim(),
    reviewedBy: "admin",
    reason: String(req.body?.reason || ""),
  });
  if (result.error) return res.status(400).json({ error: result.error });
  return res.status(200).json({ ok: true, ...result });
}
