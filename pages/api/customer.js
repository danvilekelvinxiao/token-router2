import { getDashboard, loginCustomer } from "@/lib/customer-store";
import { requireCustomerAccess } from "@/lib/api-auth";

export default function handler(req, res) {
  if (req.method === "POST") {
    try {
      const customer = loginCustomer({
        phone: req.body?.phone,
        company: req.body?.company,
        agreedToTerms: req.body?.agreedToTerms === true || req.body?.acceptTerms === true,
      });

      return res.status(200).json({
        customer,
        message: "注册成功",
      });
    } catch (error) {
      return res.status(400).json({ error: error.message || "注册失败" });
    }
  }

  if (req.method === "GET") {
    const customerId = req.query.customerId;
    if (!requireCustomerAccess(req, res, customerId)) {
      return;
    }

    const customer = getDashboard(customerId);
    return res.status(200).json({
      customer,
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
