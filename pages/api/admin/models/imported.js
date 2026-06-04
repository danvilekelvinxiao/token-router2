import { requireAdmin } from "@/lib/admin-auth";
import { listImportedModels } from "@/lib/admin-commercial-config";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const models = await listImportedModels({ upstreamId: req.query.upstreamId || "" });
  return res.status(200).json({ ok: true, models, total: models.length });
}
