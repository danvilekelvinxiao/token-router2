import { requireAdmin } from "@/lib/admin-auth";
import { checkAdminSyncConsistency } from "@/lib/admin-commercial-config";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ ok: false, error: "Method not allowed" });

  const result = await checkAdminSyncConsistency();
  return res.status(200).json(result);
}
