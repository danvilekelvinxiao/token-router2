import { requireAdmin } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { ensureWalletSchema } from "@/lib/wallet/service";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  await ensureWalletSchema();
  if (req.method === "GET") {
    const result = await query("SELECT * FROM wallet_configs ORDER BY key ASC");
    return res.status(200).json({ configs: result.rows || [] });
  }
  if (req.method === "POST") {
    const items = Array.isArray(req.body?.configs) ? req.body.configs : [];
    for (const item of items) {
      if (!item?.key) continue;
      await query(
        `INSERT INTO wallet_configs (id, key, value, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = NOW()`,
        [`cfg_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`, String(item.key), String(item.value ?? ""), String(item.description || "")]
      );
    }
    return res.status(200).json({ ok: true });
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
