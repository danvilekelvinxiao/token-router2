import { requireAdmin } from "@/lib/admin-auth";
import { saveBossWizardDraft } from "@/lib/admin-commercial-config";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const draft = await saveBossWizardDraft({
    adminId: admin.id || admin.email || "admin",
    data: req.body || {},
  });
  return res.status(200).json({ ok: true, draft, message: "草稿已保存" });
}
