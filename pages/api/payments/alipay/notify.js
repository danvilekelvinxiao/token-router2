import { markRechargeOrderPaid } from "@/lib/customer-store";
import { parseAlipayNotify } from "@/lib/payments/alipay";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("failed");
  }

  try {
    const parsed = await parseAlipayNotify(req);
    if (parsed.error) {
      return res.status(400).send("failed");
    }

    const data = parsed.result || {};
    if (!["TRADE_SUCCESS", "TRADE_FINISHED"].includes(data.trade_status)) {
      return res.status(200).send("success");
    }

    const result = await markRechargeOrderPaid({
      outTradeNo: data.out_trade_no,
      providerTradeNo: data.trade_no || "",
      amount: Number(data.total_amount || 0),
      rawPayload: parsed.raw,
      approvedBy: "alipay_notify",
      paidAt: data.notify_time || new Date().toISOString(),
    });
    if (result.error) {
      return res.status(400).send("failed");
    }

    return res.status(200).send("success");
  } catch {
    return res.status(400).send("failed");
  }
}
