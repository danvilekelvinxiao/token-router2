import { requireAdmin } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { ensureWalletForUser } from "@/lib/wallet/service";

function formatRow(row = {}) {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email || "",
    name: row.name || "",
    apiBalance: Number(row.api_balance || 0),
    totalRechargedRmb: Number(row.total_recharged_rmb || 0),
    totalGrantedApi: Number(row.total_granted_api || 0),
    totalConsumedApi: Number(row.total_consumed_api || 0),
    status: row.status || "active",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  const { q = "", userId = "", email = "", name = "", limit = 50, offset = 0 } = req.query || {};
  if (userId) {
    await ensureWalletForUser(String(userId)).catch(() => {});
  }
  const params = [];
  const where = [];
  if (userId) {
    params.push(userId);
    where.push(`w.user_id = $${params.length}`);
  }
  if (email) {
    params.push(`%${String(email).trim()}%`);
    where.push(`(c.email ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
  }
  if (name) {
    params.push(`%${String(name).trim()}%`);
    where.push(`(c.name ILIKE $${params.length} OR c.company ILIKE $${params.length})`);
  }
  if (q) {
    params.push(`%${String(q).trim()}%`);
    where.push(`(c.email ILIKE $${params.length} OR c.name ILIKE $${params.length} OR c.company ILIKE $${params.length} OR c.id ILIKE $${params.length})`);
  }
  params.push(Number(limit) || 50);
  params.push(Number(offset) || 0);

  const sql = `
    SELECT
      w.*,
      c.email,
      c.name
    FROM wallets w
    JOIN customers c ON c.id = w.user_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY w.updated_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const result = await query(sql, params);
  const wallets = (result?.rows || []).map(formatRow);
  return res.status(200).json({ wallets, total: wallets.length });
}
