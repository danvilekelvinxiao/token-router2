import { requireAdmin } from "@/lib/admin-auth";
import { getCustomer, getTemporaryCreditBalance } from "@/lib/customer-store";
import { getActivePackageTokenBalance } from "@/lib/packages/store";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const customerId = admin.customer?.id && admin.customer.id !== "admin-secret"
    ? admin.customer.id
    : "cus_admin";
  const customer = customerId ? await getCustomer(customerId) : null;
  if (!customer) {
    return res.status(404).json({ ok: false, error: "用户不存在" });
  }

  const [temporaryCreditBalance, packageTokenBalance] = await Promise.all([
    getTemporaryCreditBalance(customerId),
    getActivePackageTokenBalance(customerId),
  ]);

  const cashBalance = Number(customer.balance || 0);
  const totalAvailableCny = Number((cashBalance + Number(temporaryCreditBalance || 0)).toFixed(6));

  return res.status(200).json({
    ok: true,
    customer: {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      company: customer.company,
      role: customer.role,
      status: customer.status,
      balance: cashBalance,
      totalSpend: Number(customer.totalSpend || 0),
      createdAt: customer.createdAt,
    },
    balances: {
      cashCny: cashBalance,
      temporaryCreditCny: Number(temporaryCreditBalance || 0),
      packageTokens: Number(packageTokenBalance || 0),
      totalAvailableCny,
    },
  });
}
