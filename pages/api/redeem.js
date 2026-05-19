import { redeemActivationCode, logActivity } from "@/lib/customer-store";
import { assertCustomerOwner } from "@/lib/session";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code, customerId } = req.body || {};
  const session = assertCustomerOwner(req, res, customerId);
  if (!session) return;
  if (!code) {
    return res.status(400).json({ error: "缺少激活码或用户信息" });
  }

  const result = await redeemActivationCode(code, session.customerId);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  await logActivity({
    customerId: session.customerId,
    action: "redeem_code",
    category: "payment",
    detail: `激活码兑换成功: ${code}，到账 ¥${Number(result.amount).toFixed(2)}`,
    amount: result.amount,
    ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "",
    userAgent: req.headers["user-agent"] || "",
  });

  return res.status(200).json(result);
}
