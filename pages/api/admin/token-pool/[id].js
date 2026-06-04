import { requireAdmin } from "@/lib/admin-auth";
import { deleteTokenPool, upsertTokenPool } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ ok: false, error: "缺少 Token ID" });

  try {
    if (req.method === "PATCH") {
      const token = await upsertTokenPool({ ...(req.body || {}), id }, admin.id);
      return res.status(200).json({ ok: true, token });
    }
    if (req.method === "DELETE") {
      await deleteTokenPool(id, admin.id);
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Token 池操作失败" });
  }
}
