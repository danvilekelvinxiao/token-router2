import { getWalletOverview, listRechargeOrders, listWalletTransactions, createRechargeOrder } from "@/lib/wallet/service";
import { requireCustomerSession } from "@/lib/session";

export default async function handler(req, res) {
  const session = requireCustomerSession(req, res);
  if (!session) return;

  if (req.method === "GET") {
    const wallet = await getWalletOverview(session.customerId);
    const transactions = await listWalletTransactions({ userId: session.customerId, limit: 100 });
    const orders = await listRechargeOrders({ userId: session.customerId, limit: 50 });
    return res.status(200).json({
      wallet,
      transactions,
      orders,
      summary: {
        walletBalanceDisplay: wallet?.apiBalanceDisplay || "$ API 0.00",
        rechargeRateDisplay: wallet?.exchangeRateDisplay || "¥1 = $ API 5",
      },
    });
  }

  if (req.method === "POST") {
    const amountRmb = Number(req.body?.amountRmb || req.body?.amount || 0);
    if (!Number.isFinite(amountRmb) || amountRmb <= 0) return res.status(400).json({ error: "充值金额无效" });
    const result = await createRechargeOrder({
      userId: session.customerId,
      amountRmb,
      paymentMethod: String(req.body?.paymentMethod || "manual"),
      remark: String(req.body?.remark || ""),
    });
    if (result.error) return res.status(400).json({ error: result.error });
    return res.status(200).json({ ok: true, order: result.order });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
