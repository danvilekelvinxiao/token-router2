import { getCustomer, regenerateInviteCode, updateProfile } from "@/lib/customer-store";
import { assertCustomerOwner } from "@/lib/session";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const session = assertCustomerOwner(req, res, req.query.customerId);
    if (!session) return;
    const customer = await getCustomer(session.customerId);
    if (!customer) return res.status(404).json({ error: "用户不存在" });
    return res.status(200).json(customer);
  }

  if (req.method === "PUT") {
    const { customerId, name, company, action } = req.body || {};
    const session = assertCustomerOwner(req, res, customerId);
    if (!session) return;

    if (action === "regenerate-invite") {
      const updated = await regenerateInviteCode(session.customerId);
      if (!updated) return res.status(404).json({ error: "用户不存在" });
      return res.status(200).json(updated);
    }

    const updated = await updateProfile(session.customerId, { name, company });
    if (!updated) return res.status(404).json({ error: "用户不存在" });
    return res.status(200).json(updated);
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "Method not allowed" });
}
