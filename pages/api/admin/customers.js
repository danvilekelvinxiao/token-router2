import { hasDatabase, query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    let rows = [];
    if (hasDatabase()) {
      const result = await query(
        "SELECT id, name, email, balance, role FROM customers ORDER BY created_at DESC LIMIT 100",
      );
      rows = result.rows;
    } else {
      const store = globalThis.__TOKEN_ROUTER_CUSTOMERS__;
      rows = (store?.customers || []).map((c) => ({
        id: c.id, name: c.name, email: c.email, balance: c.balance, role: c.role || "user",
      }));
    }
    return res.status(200).json({ success: true, customers: rows });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
