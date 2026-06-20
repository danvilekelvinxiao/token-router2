import { getDashboard, listCustomerCalls } from "@/lib/customer-store";
import { requireCustomerSession } from "@/lib/session";
import { getUserWallet, listWalletTransactions } from "@/lib/wallet/ledger";
import { normalizeWalletTransaction, summarizeCalls } from "@/lib/billing/audit";

function normalizeLimit(value, fallback = 20, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.max(1, Math.min(max, Math.floor(number)));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const limit = normalizeLimit(req.query.limit, 20, 100);
  const [customer, wallet, calls, transactions] = await Promise.all([
    getDashboard(session.customerId),
    getUserWallet(session.customerId),
    listCustomerCalls(session.customerId, { limit }),
    listWalletTransactions(session.customerId, { limit }),
  ]);

  if (!customer) return res.status(404).json({ error: "用户不存在" });

  const normalizedTransactions = transactions.map(normalizeWalletTransaction).filter(Boolean);
  const summary = summarizeCalls(calls);

  return res.status(200).json({
    ok: true,
    success: true,
    userId: session.customerId,
    updatedAt: new Date().toISOString(),
    wallet: wallet || null,
    summary,
    latestRequestId: calls[0]?.requestId || normalizedTransactions.find((item) => item.requestId)?.requestId || "",
    latestCalls: calls,
    latestTransactions: normalizedTransactions,
  });
}
