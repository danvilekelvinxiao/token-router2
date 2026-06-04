import { createRedeemCode, batchCreateCodes } from "@/lib/redeem-codes";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!(await requireAdmin(req, res))) return;

  try {
    const quantity = Number(req.body?.quantity || 1);
    if (quantity > 1) {
      const result = await batchCreateCodes(req.body || {});
      return res.status(200).json({ success: true, ...result });
    }
    const code = await createRedeemCode(req.body || {});
    return res.status(200).json({ success: true, code });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || "激活码创建失败，请检查表单。" });
  }
}
