import { requireAdmin } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { ensureWalletForUser, getWalletOverview } from "@/lib/wallet/service";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const userId = String(req.query?.userId || "").trim();
  if (!userId) return res.status(400).json({ error: "缺少 userId" });
  await ensureWalletForUser(userId);
  const result = await query(
    `SELECT w.*, c.email, c.name
     FROM wallets w
     JOIN customers c ON c.id = w.user_id
     WHERE w.user_id = $1
     LIMIT 1`,
    [userId]
  );
  const wallet = result.rows[0] ? await getWalletOverview(userId) : null;
  return res.status(200).json({ wallet: wallet || null });
}
