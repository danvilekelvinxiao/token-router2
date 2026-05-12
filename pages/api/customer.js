import { getDashboard, loginCustomer } from "@/lib/customer-store";

export default function handler(req, res) {
  if (req.method === "POST") {
    const customer = loginCustomer({
      phone: req.body?.phone,
      company: req.body?.company,
    });

    return res.status(200).json(customer);
  }

  if (req.method === "GET") {
    return res.status(200).json(getDashboard(req.query.customerId));
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
