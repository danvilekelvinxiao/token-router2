import { listCustomers, updateCustomer, disableApiKey, enableApiKey } from "@/lib/customer-store";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method === "GET") {
    const customers = await listCustomers();
    return res.status(200).json({ customers });
  }

  if (req.method === "POST") {
    const { action, data } = req.body || {};
    if (action === "updateCustomer") {
      const result = await updateCustomer(data.id, data.updates);
      return res.status(200).json({ ok: true, customer: result });
    }
    if (action === "blockUser") {
      const result = await updateCustomer(data.id, { status: "blocked" });
      return res.status(200).json({ ok: true, customer: result });
    }
    if (action === "unblockUser") {
      const result = await updateCustomer(data.id, { status: "active" });
      return res.status(200).json({ ok: true, customer: result });
    }
    if (action === "disableKey") {
      await disableApiKey(data.keyId);
      return res.status(200).json({ ok: true });
    }
    if (action === "enableKey") {
      await enableApiKey(data.keyId);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Unknown action" });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
