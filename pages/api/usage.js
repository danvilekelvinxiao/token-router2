import { getDashboard, rechargeCustomer } from "@/lib/customer-store";

function isAdmin(req) {
  const expected = process.env.ADMIN_SECRET || "";
  const provided = req.headers["x-admin-secret"] || req.body?.adminSecret || req.query?.adminSecret;
  return expected && provided === expected;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const customer = await getDashboard(req.query.customerId);
    if (!customer) return res.status(404).json({ error: "用户不存在或服务实例已重启" });
    return res.status(200).json(customer);
  }

  if (req.method === "POST") {
    if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });
    return res.status(200).json(await rechargeCustomer(req.body?.customerId, req.body?.amount));
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
