import { requireAdmin } from "@/lib/admin-auth";
import { listCustomers } from "@/lib/customer-store";
import { getMembershipConfig, getUserMembership, updateMembershipConfig, upsertUserMembership } from "@/lib/membership/store";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method === "GET") {
    const customers = await listCustomers();
    return res.status(200).json({
      success: true,
      config: getMembershipConfig(),
      users: (customers || []).slice(0, 100).map((customer) => ({
        id: customer.id,
        name: customer.name || customer.email,
        email: customer.email,
        balance: Number(customer.balance || 0),
        membership: getUserMembership(customer.id),
      })),
    });
  }

  if (req.method === "POST") {
    const action = req.body?.action || "config";
    if (action === "config") {
      return res.status(200).json({ success: true, config: updateMembershipConfig(req.body?.config || {}) });
    }
    if (action === "grant") {
      const userId = req.body?.userId;
      if (!userId) return res.status(400).json({ success: false, error: "缺少 userId" });
      return res.status(200).json({ success: true, membership: upsertUserMembership(userId, req.body?.membership || {}) });
    }
    return res.status(400).json({ success: false, error: "未知操作" });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
