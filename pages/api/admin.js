import {
  adjustCustomerBalance,
  createActivationCode,
  getAdminSnapshot,
} from "@/lib/customer-store";
import { requireAdminAccess } from "@/lib/api-auth";

export default function handler(req, res) {
  if (!requireAdminAccess(req, res)) {
    return;
  }

  if (req.method === "GET") {
    return res.status(200).json(getAdminSnapshot());
  }

  if (req.method === "POST") {
    const action = req.body?.action;

    if (action === "adjustBalance") {
      const customer = adjustCustomerBalance(
        req.body?.customerId,
        req.body?.amount,
        req.body?.reason || "manual_adjust",
      );

      if (!customer) {
        return res.status(404).json({ error: "客户不存在" });
      }

      return res.status(200).json({ customer, snapshot: getAdminSnapshot() });
    }

    if (action === "createActivationCode") {
      const code = createActivationCode({
        amount: req.body?.amount,
        note: req.body?.note || "",
      });

      return res.status(200).json({ code, snapshot: getAdminSnapshot() });
    }

    return res.status(400).json({ error: "Unsupported admin action" });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
