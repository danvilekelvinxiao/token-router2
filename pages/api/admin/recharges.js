import { approveRechargeOrder, listRechargeOrders } from "@/lib/customer-store";

function checkAdmin(req) {
  const expected = process.env.ADMIN_SECRET || "";
  const provided = req.headers["x-admin-secret"] || req.query?.secret || req.body?.secret;
  return expected && provided === expected;
}

export default async function handler(req, res) {
  if (!checkAdmin(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.method === "GET") {
    const orders = await listRechargeOrders({
      status: req.query?.status || "",
      limit: Number(req.query?.limit || 120),
    });
    return res.status(200).json({ orders });
  }

  if (req.method === "POST") {
    const { orderId, action = "approve" } = req.body || {};
    if (action !== "approve") return res.status(400).json({ error: "Unsupported action" });
    const result = await approveRechargeOrder({ orderId, approvedBy: "admin" });
    if (result.error) return res.status(400).json({ error: result.error });
    return res.status(200).json({ ok: true, ...result });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
