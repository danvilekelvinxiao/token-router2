import { requireAdmin } from "@/lib/admin-auth";
import { listWalletTransactions } from "@/lib/wallet/service";

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const userId = String(req.query?.userId || "").trim();
  if (!userId) return res.status(400).json({ error: "缺少 userId" });
  const limit = Number(req.query?.limit || 100);
  const offset = Number(req.query?.offset || 0);
  const transactions = await listWalletTransactions({ userId, limit, offset });
  return res.status(200).json({ transactions });
}
