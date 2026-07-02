import { requireAdmin } from "@/lib/admin-auth";
import { addWalletBalance } from "@/lib/wallet/service";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const userId = String(req.query?.userId || "").trim();
  const amountApi = Number(req.body?.amountApi ?? req.body?.amount ?? 0);
  if (!userId || !Number.isFinite(amountApi) || amountApi <= 0) return res.status(400).json({ error: "参数无效" });
  const result = await addWalletBalance({
    userId,
    amountApi,
    description: String(req.body?.description || "后台加款"),
    createdBy: "admin",
    type: "admin_add",
    metadata: { operator: "admin" },
  });
  if (result.error) return res.status(400).json({ error: result.error });
  return res.status(200).json({ ok: true, wallet: result.wallet });
}
