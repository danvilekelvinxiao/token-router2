import { requireAdmin } from "@/lib/admin-auth";
import { addWhitelistToken } from "@/lib/new-api/passthrough";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { name, token, notes } = req.body || {};
  if (!name?.trim() || !token?.trim()) {
    return res.status(400).json({ success: false, error: "名称和 Token 不能为空" });
  }

  try {
    const result = await addWhitelistToken({
      name: name.trim(),
      token: token.trim(),
      notes: notes || "",
      adminId: String(admin.id || admin.customerId || ""),
    });
    return res.status(200).json({ success: true, token: result });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
