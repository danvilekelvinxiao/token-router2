import { markRechargeOrderPaid } from "@/lib/customer-store";
import { fromFen } from "@/lib/payments/common";
import { parseWechatNotify } from "@/lib/payments/wechat";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const parsed = await parseWechatNotify(req);
    if (parsed.error) {
      return res.status(400).json({ code: "FAIL", message: parsed.error });
    }

    const data = parsed.result || {};
    if (data.trade_state !== "SUCCESS") {
      return res.status(200).json({ code: "SUCCESS", message: "忽略非成功支付" });
    }

    const result = await markRechargeOrderPaid({
      outTradeNo: data.out_trade_no,
      providerTradeNo: data.transaction_id || "",
      amount: fromFen(data.amount?.total),
      rawPayload: parsed.raw,
      approvedBy: "wechat_notify",
      paidAt: data.success_time || new Date().toISOString(),
    });
    if (result.error) {
      return res.status(400).json({ code: "FAIL", message: result.error });
    }

    return res.status(200).json({ code: "SUCCESS", message: "成功" });
  } catch (error) {
    return res.status(400).json({ code: "FAIL", message: error?.message || "回调处理失败" });
  }
}
