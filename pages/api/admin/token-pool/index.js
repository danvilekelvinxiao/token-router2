import { requireAdmin } from "@/lib/admin-auth";
import { listTokenPool, upsertTokenPool } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, tokens: await listTokenPool() });
    }
    if (req.method === "POST") {
      const token = await upsertTokenPool(req.body || {}, admin.id);
      return res.status(200).json({ ok: true, token });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Token 池操作失败" });
  }
}
