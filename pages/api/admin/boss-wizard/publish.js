import { requireAdmin } from "@/lib/admin-auth";
import { publishModels } from "@/lib/admin-commercial-config";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const result = await publishModels({
      ...(req.body || {}),
      adminId: admin.id || admin.email || "admin",
    });
    return res.status(200).json({ ok: true, message: "已成功发布到模型广场", ...result });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || "发布失败" });
  }
}
