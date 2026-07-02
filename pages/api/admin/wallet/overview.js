import { requireAdmin } from "@/lib/admin-auth";
import { query } from "@/lib/db";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const result = await query(`
    SELECT
      COALESCE(SUM(api_balance), 0) AS platform_api_balance,
      COALESCE(SUM(total_recharged_rmb), 0) AS total_recharged_rmb,
      COALESCE(SUM(total_granted_api), 0) AS total_granted_api,
      COALESCE(SUM(total_consumed_api), 0) AS total_consumed_api
    FROM wallets
  `);
  return res.status(200).json({ overview: result?.rows?.[0] || {} });
}
